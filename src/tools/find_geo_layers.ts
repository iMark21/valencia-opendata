import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ArcgisClient } from "../clients/arcgis.js";
import { ArcgisError } from "../types/arcgis.js";

const description =
  "Discover available Geoportal layers. Pass `service` to enumerate layers " +
  "of a single MapServer (e.g. 'OPENDATA/Trafico'). Pass `query` to search " +
  "layer names across all OPENDATA services (accent-insensitive). With no " +
  "args, returns the catalog of services with layer counts. Cached 1h — " +
  "the catalog is effectively static.";

const inputSchema = {
  service: z
    .string()
    .min(1)
    .optional()
    .describe(
      "ArcGIS service path. When set, returns all layers of that service.",
    ),
  query: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Free-text search across layer names. Mutually exclusive with `service`.",
    ),
};

type Input = { service?: string; query?: string };

type LayerEntry = {
  service: string;
  layer_id: number;
  name: string;
  description?: string;
  geometry_type: string | null;
  fields_count: number | null;
};

type ServiceEntry = {
  service: string;
  layers_count: number | null;
};

const CATALOG_TTL_SECONDS = 3600;

export function registerFindGeoLayersTool(
  server: McpServer,
  arcgis: ArcgisClient,
): void {
  server.tool(
    "find_geo_layers",
    description,
    inputSchema,
    async (raw: Input) => {
      const args = raw ?? {};
      try {
        if (args.service && args.query) {
          return jsonResult({
            error: {
              code: "invalid_input",
              message:
                "service and query are mutually exclusive — pass one or none.",
            },
          });
        }

        if (args.service) {
          const layers = await listLayers(arcgis, args.service);
          return jsonResult({
            layers,
            source: { catalog_url: serviceCatalogUrl() },
          });
        }

        if (args.query) {
          const services = await listOpendataServices(arcgis);
          const allLayers: LayerEntry[] = [];
          for (const svc of services) {
            try {
              const layers = await listLayers(arcgis, svc);
              for (const l of layers) allLayers.push(l);
            } catch {
              // Skip services that error out — discovery is best-effort.
            }
          }
          const filtered = allLayers.filter((l) =>
            normalize(l.name).includes(normalize(args.query!)),
          );
          return jsonResult({
            layers: filtered,
            source: { catalog_url: serviceCatalogUrl() },
          });
        }

        // No args → catalog with layer counts per service.
        const services = await listOpendataServices(arcgis);
        const summary: ServiceEntry[] = [];
        for (const svc of services) {
          let count: number | null = null;
          try {
            const info = await arcgis.serviceInfo(svc);
            count = info.layers?.length ?? 0;
          } catch {
            count = null;
          }
          summary.push({ service: svc, layers_count: count });
        }
        return jsonResult({
          services: summary,
          source: { catalog_url: serviceCatalogUrl() },
        });
      } catch (err) {
        if (err instanceof ArcgisError) {
          return jsonResult({
            error: {
              code: "arcgis_error",
              http_status: err.httpStatus,
              service: err.serviceName,
              message: err.message,
            },
          });
        }
        throw err;
      }
    },
  );
}

async function listLayers(
  arcgis: ArcgisClient,
  service: string,
): Promise<LayerEntry[]> {
  const info = await arcgis.serviceInfo(service);
  const layers = info.layers ?? [];
  const out: LayerEntry[] = [];
  for (const layer of layers) {
    let fieldsCount: number | null = null;
    try {
      const li = await arcgis.layerInfo(service, layer.id);
      fieldsCount = li.fields?.length ?? null;
    } catch {
      fieldsCount = null;
    }
    out.push({
      service,
      layer_id: layer.id,
      name: layer.name,
      geometry_type: layer.geometryType ?? null,
      fields_count: fieldsCount,
    });
  }
  return out;
}

async function listOpendataServices(arcgis: ArcgisClient): Promise<string[]> {
  const listing = await arcgis.listServices("OPENDATA");
  return (listing.services ?? [])
    .filter((s) => s.type === "MapServer")
    .map((s) => s.name);
}

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function serviceCatalogUrl(): string {
  return "https://geoportal.valencia.es/server/rest/services/OPENDATA?f=json";
}

function jsonResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

// Re-exported for external test of TTL choice without coupling to private state.
export const CATALOG_TTL = CATALOG_TTL_SECONDS;
