import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ArcgisClient } from "../clients/arcgis.js";
import { ArcgisError, GeoFeature } from "../types/arcgis.js";
import { utm30NToWgs84, haversineMeters } from "./_geo.js";

const EMT_SERVICE = "OPENDATA/Trafico";
const EMT_LAYER = 226;
const TTL_SECONDS = 3600; // bus stops barely move; cache an hour
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DEFAULT_RADIUS_M = 500;

const description =
  "Live València EMT bus stops. Wraps Geoportal layer 226 (OPENDATA/Trafico). " +
  "Returns id, name, lines passing through and a per-stop arrivals_url " +
  "(emtvalencia.es QR page) — the portal does not expose live ETAs in the " +
  "Geoportal, the URL is the official pointer. Requires `near` or `linea` " +
  "as filter to avoid fetching all 2000+ stops.";

const inputSchema = {
  near: z
    .object({
      lat: z.number(),
      lng: z.number(),
      radius_m: z.number().positive().optional(),
    })
    .optional()
    .describe(
      `Latitude/longitude (WGS84) + optional radius_m (default ${DEFAULT_RADIUS_M}). ` +
        "Sorts by distance ascending.",
    ),
  linea: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Bus line code (e.g. '10', '63', 'N1'). Matches stops where the line " +
        "is in the comma/space-separated `lineas` field.",
    ),
  include_inactive: z
    .boolean()
    .optional()
    .describe("Include suprimida=1 stops. Default false."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Max stops returned (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`),
};

type Input = {
  near?: { lat: number; lng: number; radius_m?: number };
  linea?: string;
  include_inactive?: boolean;
  limit?: number;
};

type Stop = {
  id: number | null;
  name: string;
  lines: string[];
  lat: number;
  lng: number;
  distance_m?: number;
  arrivals_url: string | null;
  inactive: boolean;
};

export function registerGetEmtStopsTool(
  server: McpServer,
  arcgis: ArcgisClient,
): void {
  server.tool(
    "get_emt_stops",
    description,
    inputSchema,
    async (raw: Input) => {
      const args = raw ?? {};
      if (!args.near && !args.linea) {
        return jsonResult({
          error: {
            code: "requires_filter",
            message:
              "Provide `near` (lat/lng) or `linea` to avoid fetching all 2000+ stops.",
          },
        });
      }

      try {
        const result = await arcgis.queryLayer(EMT_SERVICE, EMT_LAYER, {
          where: "1=1",
          outFields: "*",
          ttlSeconds: TTL_SECONDS,
        });

        const includeInactive = args.include_inactive === true;
        let stops = result.features.map(toStop);

        if (!includeInactive) {
          stops = stops.filter((s) => !s.inactive);
        }

        if (args.linea) {
          const target = args.linea.trim().toUpperCase();
          stops = stops.filter((s) =>
            s.lines.some((l) => l.toUpperCase() === target),
          );
        }

        if (args.near) {
          const radius = args.near.radius_m ?? DEFAULT_RADIUS_M;
          stops = stops
            .map((s) => ({
              ...s,
              distance_m: haversineMeters(
                args.near!.lat,
                args.near!.lng,
                s.lat,
                s.lng,
              ),
            }))
            .filter((s) => (s.distance_m ?? Infinity) <= radius)
            .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
        }

        const limit = args.limit ?? DEFAULT_LIMIT;
        const trimmed = stops.slice(0, limit);

        return jsonResult({
          query: { near: args.near, linea: args.linea, include_inactive: includeInactive },
          stops: trimmed,
          count: trimmed.length,
          source: {
            service: EMT_SERVICE,
            layer_id: EMT_LAYER,
            dataset_id: "a475cbb2-4421-484e-bb0a-e8deac4dad21",
            attribution: "Datos: Ajuntament de València, EMT (CC BY 4.0).",
          },
          data_freshness_seconds: TTL_SECONDS,
        });
      } catch (err) {
        if (err instanceof ArcgisError) {
          return jsonResult({
            error: { code: "arcgis_error", message: err.message },
          });
        }
        throw err;
      }
    },
  );
}

function toStop(f: GeoFeature): Stop {
  const a = f.attributes;
  const [lng, lat] = projectToWgs84(f);
  const id = typeof a.id_parada === "number" ? a.id_parada : null;
  return {
    id,
    name: typeof a.denominacion === "string" ? a.denominacion : "",
    lines: parseLines(a.lineas),
    lat,
    lng,
    arrivals_url:
      typeof a.proximas_llegadas === "string" && a.proximas_llegadas.length > 0
        ? a.proximas_llegadas
        : id !== null
          ? `http://www.emtvalencia.es/QR.php?sec=est&p=${id}`
          : null,
    inactive: a.suprimida === 1,
  };
}

// "62"            → ["62"]
// "10, 12, N1"    → ["10", "12", "N1"]
// "63"            → ["63"]
// "10/12"         → ["10", "12"]
function parseLines(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.trim().length === 0) return [];
  return raw
    .split(/[,/;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function projectToWgs84(f: GeoFeature): [number, number] {
  if (f.geometry?.type !== "Point") return [0, 0];
  const [x, y] = f.geometry.coordinates;
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return [x, y];
  return utm30NToWgs84(x, y);
}

function jsonResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

export const __test__ = { parseLines };
