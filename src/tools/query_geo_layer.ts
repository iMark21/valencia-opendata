import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ArcgisClient } from "../clients/arcgis.js";
import { ArcgisError } from "../types/arcgis.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const HIGH_VELOCITY_TTL = 30;

const description =
  "Query any of the València Geoportal MapServer layers (228+ capas) with " +
  "ArcGIS-style filters. Use service+layer_id from get_dataset.related_layers " +
  "or find_geo_layers. Examples: ValenBisi disponibilidad → " +
  "service='OPENDATA/Trafico' layer_id=228; tráfico tramos → 220; " +
  "EMT paradas → 226. Supports where (SQL-like), out_fields, near (lat/lng/" +
  "radius_m), bbox, return_geometry, limit. Returns GeoJSON-like features " +
  "live; never persists.";

const inputSchema = {
  service: z
    .string()
    .min(1)
    .describe(
      "ArcGIS service path (e.g. 'OPENDATA/Trafico', 'OPENDATA/MedioAmbiente').",
    ),
  layer_id: z
    .number()
    .int()
    .min(0)
    .describe("Numeric layer id within the service."),
  where: z
    .string()
    .optional()
    .describe("SQL-like ArcGIS where clause (default '1=1')."),
  out_fields: z
    .array(z.string())
    .optional()
    .describe("Attribute names to return; default ['*']."),
  near: z
    .object({
      lat: z.number(),
      lng: z.number(),
      radius_m: z.number().positive(),
    })
    .optional()
    .describe(
      "Spatial filter by point + radius in meters (WGS84). Translates to a " +
        "bbox envelope around the point.",
    ),
  bbox: z
    .object({
      minLat: z.number(),
      minLng: z.number(),
      maxLat: z.number(),
      maxLng: z.number(),
    })
    .optional()
    .describe("Bounding box in WGS84. Mutually exclusive with `near`."),
  return_geometry: z
    .boolean()
    .optional()
    .describe("Default true."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Max features to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`),
};

type Input = {
  service: string;
  layer_id: number;
  where?: string;
  out_fields?: string[];
  near?: { lat: number; lng: number; radius_m: number };
  bbox?: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  return_geometry?: boolean;
  limit?: number;
};

export function registerQueryGeoLayerTool(
  server: McpServer,
  arcgis: ArcgisClient,
): void {
  server.tool(
    "query_geo_layer",
    description,
    inputSchema,
    async (raw: Input) => {
      const args = raw;
      if (args.near && args.bbox) {
        return jsonResult({
          error: {
            code: "invalid_input",
            message:
              "near and bbox are mutually exclusive — pick one spatial filter.",
          },
        });
      }

      const envelope = args.near
        ? envelopeFromNear(args.near)
        : args.bbox
          ? envelopeFromBbox(args.bbox)
          : undefined;

      try {
        const result = await arcgis.queryLayer(args.service, args.layer_id, {
          where: args.where ?? "1=1",
          outFields: args.out_fields ?? "*",
          returnGeometry: args.return_geometry ?? true,
          resultRecordCount: args.limit ?? DEFAULT_LIMIT,
          ...(envelope
            ? {
                geometry: envelope,
                geometryType: "esriGeometryEnvelope",
                spatialRel: "esriSpatialRelIntersects",
              }
            : {}),
          ttlSeconds: HIGH_VELOCITY_TTL,
        });

        return jsonResult({
          service: args.service,
          layer_id: args.layer_id,
          count: result.count,
          exceeded_transfer_limit: result.exceededTransferLimit,
          features: result.features,
          source: {
            endpoint:
              "https://geoportal.valencia.es/server/rest/services/" +
              `${args.service}/MapServer/${args.layer_id}/query`,
            attribution:
              "Datos: Ajuntament de València (CC BY 4.0). " +
              "https://geoportal.valencia.es",
          },
        });
      } catch (err) {
        if (err instanceof ArcgisError) {
          if (err.httpStatus === 404 || isLayerNotFound(err.message)) {
            return jsonResult({
              error: {
                code: "layer_not_found",
                service: args.service,
                layer_id: args.layer_id,
                message: err.message,
                suggestion:
                  "Use find_geo_layers(service?) to discover valid layer ids.",
              },
            });
          }
          return jsonResult({
            error: {
              code: "arcgis_error",
              http_status: err.httpStatus,
              service: err.serviceName,
              layer_id: err.layerId,
              message: err.message,
              sample: err.sample,
            },
          });
        }
        throw err;
      }
    },
  );
}

// ArcGIS uses a few phrasings for layer/service-not-found errors. Match the
// keyword pairs (layer + missing|invalid|not found|cannot find) so that we
// route them to a typed error instead of a generic arcgis_error.
function isLayerNotFound(message: string): boolean {
  const m = message.toLowerCase();
  // Direct layer references
  if (m.includes("layer")) {
    if (
      m.includes("invalid") ||
      m.includes("missing") ||
      m.includes("not found") ||
      m.includes("cannot find") ||
      m.includes("does not exist")
    ) {
      return true;
    }
  }
  // ArcGIS Server's generic 400 for unknown layer ids reads as "invalid or
  // missing input parameters". Since our Zod schema validates everything we
  // pass to the client, the only remaining variable that could trigger this
  // on the /query endpoint is the layer id itself.
  if (
    m.includes("invalid or missing input parameters") ||
    (m.includes("invalid") && m.includes("input parameters"))
  ) {
    return true;
  }
  return false;
}

// Approximate WGS84 envelope around a point. Good enough for ArcGIS bbox
// filtering — the server still applies its own spatial intersection on the
// real geometry; this just defines the search window.
function envelopeFromNear(near: {
  lat: number;
  lng: number;
  radius_m: number;
}): EnvelopeJson {
  const dLat = near.radius_m / 111_320;
  const cosLat = Math.cos((near.lat * Math.PI) / 180) || 1e-6;
  const dLng = near.radius_m / (111_320 * cosLat);
  return {
    xmin: near.lng - dLng,
    ymin: near.lat - dLat,
    xmax: near.lng + dLng,
    ymax: near.lat + dLat,
    spatialReference: { wkid: 4326 },
  };
}

function envelopeFromBbox(bbox: {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}): EnvelopeJson {
  return {
    xmin: bbox.minLng,
    ymin: bbox.minLat,
    xmax: bbox.maxLng,
    ymax: bbox.maxLat,
    spatialReference: { wkid: 4326 },
  };
}

type EnvelopeJson = {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference: { wkid: number };
};

export const __test__ = { envelopeFromNear, envelopeFromBbox };

function jsonResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}
