import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ArcgisClient } from "../clients/arcgis.js";
import { ArcgisError, GeoFeature } from "../types/arcgis.js";
import { utm30NToWgs84 } from "./_geo.js";

const VALENBISI_SERVICE = "OPENDATA/Trafico";
const VALENBISI_LAYER = 228;
const TTL_SECONDS = 30;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;
const DEFAULT_RADIUS_M = 500;

const description =
  "Live ValenBisi station availability (bike-share). Wraps Geoportal layer " +
  "228 (OPENDATA/Trafico). Returns bikes_available, docks_free, status " +
  "and last_updated_at per station. Use `near` for proximity, `station_id` " +
  "for a specific station, `only_available: true` (default) to filter out " +
  "empty/closed stations.";

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
  station_id: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Station number (1..N). Mutually exclusive with `near`."),
  only_available: z
    .boolean()
    .optional()
    .describe("Default true. Hides closed stations and stations with 0 bikes."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Max stations returned (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`),
};

type Input = {
  near?: { lat: number; lng: number; radius_m?: number };
  station_id?: number;
  only_available?: boolean;
  limit?: number;
};

type Station = {
  id: number | null;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  distance_m?: number;
  bikes_available: number | null;
  docks_free: number | null;
  bikes_total: number | null;
  status: "open" | "closed" | "unknown";
  last_updated_at: string | null;
};

export function registerGetValenbisiTool(
  server: McpServer,
  arcgis: ArcgisClient,
): void {
  server.tool(
    "get_valenbisi_availability",
    description,
    inputSchema,
    async (raw: Input) => {
      const args = raw ?? {};
      if (args.near && args.station_id !== undefined) {
        return jsonResult({
          error: {
            code: "invalid_input",
            message: "near and station_id are mutually exclusive.",
          },
        });
      }

      try {
        const queryOpts: Parameters<ArcgisClient["queryLayer"]>[2] = {
          where: "1=1",
          outFields: "*",
          ttlSeconds: TTL_SECONDS,
        };
        if (args.station_id !== undefined) {
          queryOpts.where = `number=${args.station_id}`;
        }

        const result = await arcgis.queryLayer(
          VALENBISI_SERVICE,
          VALENBISI_LAYER,
          queryOpts,
        );

        let stations = result.features.map(toStation);
        const onlyAvailable = args.only_available !== false;

        if (args.near) {
          const radius = args.near.radius_m ?? DEFAULT_RADIUS_M;
          stations = stations
            .map((s) => ({
              ...s,
              distance_m: haversine(
                args.near!.lat,
                args.near!.lng,
                s.lat,
                s.lng,
              ),
            }))
            .filter((s) => (s.distance_m ?? Infinity) <= radius)
            .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
        }

        if (onlyAvailable) {
          stations = stations.filter(
            (s) =>
              s.status === "open" &&
              typeof s.bikes_available === "number" &&
              s.bikes_available > 0,
          );
        }

        const limit = args.limit ?? DEFAULT_LIMIT;
        const trimmed = stations.slice(0, limit);

        return jsonResult({
          query: { near: args.near, station_id: args.station_id, only_available: onlyAvailable },
          stations: trimmed,
          source: {
            service: VALENBISI_SERVICE,
            layer_id: VALENBISI_LAYER,
            dataset_id: "valenbisi-disponibilitat-valenbisi-dsiponibilidad",
            attribution: "Datos: Ajuntament de València (CC BY 4.0).",
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

function toStation(f: GeoFeature): Station {
  const a = f.attributes;
  const [lng, lat] = projectToWgs84(f);
  const status =
    a.open === "T" ? "open" : a.open === "F" ? "closed" : "unknown";
  return {
    id: typeof a.number === "number" ? a.number : null,
    name: prettyStationName((a.name as string | undefined) ?? ""),
    address: (a.address as string | null | undefined) ?? null,
    lat,
    lng,
    bikes_available: typeof a.available === "number" ? a.available : null,
    docks_free: typeof a.free === "number" ? a.free : null,
    bikes_total: typeof a.total === "number" ? a.total : null,
    status,
    last_updated_at:
      typeof a.update_jcd === "number" && Number.isFinite(a.update_jcd)
        ? new Date(a.update_jcd).toISOString()
        : typeof a.updated_at === "string"
          ? (a.updated_at as string)
          : null,
  };
}

function projectToWgs84(f: GeoFeature): [number, number] {
  if (f.geometry?.type !== "Point") return [0, 0];
  const [x, y] = f.geometry.coordinates;
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return [x, y];
  return utm30NToWgs84(x, y);
}

// "001_GUILLEN_DE_CASTRO" → "Guillen de Castro"
function prettyStationName(raw: string): string {
  if (!raw) return raw;
  const stripped = raw.replace(/^\d+_/, "");
  return stripped
    .toLowerCase()
    .split("_")
    .map((w) =>
      w === "de" || w === "del" || w === "la" || w === "el" || w === "y"
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function jsonResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

export const __test__ = { prettyStationName, haversine };
