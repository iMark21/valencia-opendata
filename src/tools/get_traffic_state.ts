import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ArcgisClient } from "../clients/arcgis.js";
import { ArcgisError, GeoFeature } from "../types/arcgis.js";
import { utm30NToWgs84, haversineMeters } from "./_geo.js";

const SERVICE = "OPENDATA/Trafico";
const LAYER_TRAMOS = 192;
const LAYER_INTENSITY = 208;
const LAYER_CAMERAS = 190;
const TTL_SECONDS = 30;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_RADIUS_M = 1000;

const STATUS_LABELS = ["fluido", "denso", "congestionado", "cortado"] as const;

const description =
  "Live traffic state for València. Three scopes: 'tramos' (street segments " +
  "with status fluido/denso/congestionado/cortado, layer 192), 'intensity' " +
  "(electromagnetic loop sensors, vehicles/hour, layer 208), 'cameras' " +
  "(traffic cameras with public viewer URL, layer 190). Use 'all' to get " +
  "every scope. Filter by `near` (lat/lng + radius_m). Live — no replication.";

const inputSchema = {
  scope: z
    .enum(["tramos", "intensity", "cameras", "all"])
    .describe("Which traffic dataset to return."),
  near: z
    .object({
      lat: z.number(),
      lng: z.number(),
      radius_m: z.number().positive().optional(),
    })
    .optional()
    .describe(
      `Latitude/longitude (WGS84) + radius_m (default ${DEFAULT_RADIUS_M}). ` +
        "Sorts by distance ascending.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Max items per scope (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`),
};

type Input = {
  scope: "tramos" | "intensity" | "cameras" | "all";
  near?: { lat: number; lng: number; radius_m?: number };
  limit?: number;
};

export function registerGetTrafficStateTool(
  server: McpServer,
  arcgis: ArcgisClient,
): void {
  server.tool(
    "get_traffic_state",
    description,
    inputSchema,
    async (raw: Input) => {
      const args = raw;
      const limit = args.limit ?? DEFAULT_LIMIT;
      const radius = args.near?.radius_m ?? DEFAULT_RADIUS_M;
      const sourceBase = sourceFor(args.scope);

      try {
        if (args.scope === "tramos") {
          return jsonResult({
            scope: "tramos",
            tramos: await fetchTramos(arcgis, args.near, radius, limit),
            source: sourceBase,
          });
        }
        if (args.scope === "intensity") {
          return jsonResult({
            scope: "intensity",
            points: await fetchIntensity(arcgis, args.near, radius, limit),
            source: sourceBase,
          });
        }
        if (args.scope === "cameras") {
          return jsonResult({
            scope: "cameras",
            cameras: await fetchCameras(arcgis, args.near, radius, limit),
            source: sourceBase,
          });
        }
        // all
        const [tramos, intensity, cameras] = await Promise.all([
          fetchTramos(arcgis, args.near, radius, limit),
          fetchIntensity(arcgis, args.near, radius, limit),
          fetchCameras(arcgis, args.near, radius, limit),
        ]);
        return jsonResult({
          scope: "all",
          tramos,
          intensity_points: intensity,
          cameras,
          source: { service: SERVICE, layers: [LAYER_TRAMOS, LAYER_INTENSITY, LAYER_CAMERAS] },
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

type Tramo = {
  id: number | null;
  name: string | null;
  status: (typeof STATUS_LABELS)[number] | "unknown";
  status_code: number | null;
  fiware_id: string | null;
  coords: Array<[number, number]>;
};

type IntensityPoint = {
  point_id: number | null;
  vehicles_per_hour: number | null;
  angle_degrees: number | null;
  lat: number;
  lng: number;
  distance_m?: number;
  last_reading_at: string | null;
};

type Camera = {
  id: string | null;
  type: string | null;
  description: string | null;
  url: string | null;
  angle_degrees: number | null;
  lat: number;
  lng: number;
  distance_m?: number;
};

async function fetchTramos(
  arcgis: ArcgisClient,
  near: Input["near"] | undefined,
  radius: number,
  limit: number,
): Promise<Tramo[]> {
  const result = await arcgis.queryLayer(SERVICE, LAYER_TRAMOS, {
    where: "1=1",
    outFields: "*",
    resultRecordCount: limit * 4,
    ttlSeconds: TTL_SECONDS,
  });
  let tramos: Tramo[] = result.features.map(toTramo);
  if (near) {
    tramos = tramos
      .map((t) => ({
        ...t,
        _midDistance: midpointDistance(t.coords, near.lat, near.lng),
      }))
      .filter((t) => t._midDistance <= radius)
      .sort((a, b) => a._midDistance - b._midDistance)
      .map(({ _midDistance: _ignored, ...rest }) => rest);
  }
  return tramos.slice(0, limit);
}

async function fetchIntensity(
  arcgis: ArcgisClient,
  near: Input["near"] | undefined,
  radius: number,
  limit: number,
): Promise<IntensityPoint[]> {
  const result = await arcgis.queryLayer(SERVICE, LAYER_INTENSITY, {
    where: "1=1",
    outFields: "*",
    resultRecordCount: Math.min(limit * 4, MAX_LIMIT * 4),
    ttlSeconds: TTL_SECONDS,
  });
  let points: IntensityPoint[] = result.features.map(toIntensityPoint);
  if (near) {
    points = points
      .map((p) => ({
        ...p,
        distance_m: haversineMeters(near.lat, near.lng, p.lat, p.lng),
      }))
      .filter((p) => (p.distance_m ?? Infinity) <= radius)
      .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
  }
  return points.slice(0, limit);
}

async function fetchCameras(
  arcgis: ArcgisClient,
  near: Input["near"] | undefined,
  radius: number,
  limit: number,
): Promise<Camera[]> {
  const result = await arcgis.queryLayer(SERVICE, LAYER_CAMERAS, {
    where: "1=1",
    outFields: "*",
    resultRecordCount: Math.min(limit * 4, MAX_LIMIT * 4),
    ttlSeconds: TTL_SECONDS,
  });
  let cameras: Camera[] = result.features.map(toCamera);
  if (near) {
    cameras = cameras
      .map((c) => ({
        ...c,
        distance_m: haversineMeters(near.lat, near.lng, c.lat, c.lng),
      }))
      .filter((c) => (c.distance_m ?? Infinity) <= radius)
      .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
  }
  return cameras.slice(0, limit);
}

function toTramo(f: GeoFeature): Tramo {
  const a = f.attributes;
  const coords = polylineToWgs84(f);
  const code = typeof a.estado === "number" ? a.estado : null;
  const status =
    code !== null && code >= 0 && code < STATUS_LABELS.length
      ? STATUS_LABELS[code]!
      : "unknown";
  return {
    id: typeof a.idtramo === "number" ? a.idtramo : null,
    name: (a.denominacion as string | null | undefined) ?? null,
    status,
    status_code: code,
    fiware_id: (a.fiwareid as string | null | undefined) ?? null,
    coords,
  };
}

function toIntensityPoint(f: GeoFeature): IntensityPoint {
  const a = f.attributes;
  const [lng, lat] = pointToWgs84(f);
  const lastEdited =
    typeof a.last_edited_date === "number" ? a.last_edited_date : null;
  return {
    point_id: typeof a.idpm === "number" ? a.idpm : null,
    vehicles_per_hour: typeof a.ih === "number" ? a.ih : null,
    angle_degrees: typeof a.angulo === "number" ? a.angulo : null,
    lat,
    lng,
    last_reading_at: lastEdited ? new Date(lastEdited).toISOString() : null,
  };
}

function toCamera(f: GeoFeature): Camera {
  const a = f.attributes;
  const [lng, lat] = pointToWgs84(f);
  return {
    id: (a.idcamara as string | null | undefined) ?? null,
    type: (a.tipocamara as string | null | undefined) ?? null,
    description: (a.descripcio as string | null | undefined) ?? null,
    url: (a.url as string | null | undefined) ?? null,
    angle_degrees: typeof a.angulo === "number" ? a.angulo : null,
    lat,
    lng,
  };
}

function pointToWgs84(f: GeoFeature): [number, number] {
  if (f.geometry?.type !== "Point") return [0, 0];
  const [x, y] = f.geometry.coordinates;
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return [x, y];
  return utm30NToWgs84(x, y);
}

function polylineToWgs84(f: GeoFeature): Array<[number, number]> {
  if (f.geometry?.type !== "LineString") return [];
  const coords = f.geometry.coordinates;
  if (coords.length === 0) return [];
  const [x0, y0] = coords[0]!;
  if (Math.abs(x0) <= 180 && Math.abs(y0) <= 90) {
    return coords.map(([x, y]) => [x, y]);
  }
  return coords.map(([x, y]) => utm30NToWgs84(x, y));
}

function midpointDistance(
  coords: Array<[number, number]>,
  lat: number,
  lng: number,
): number {
  if (coords.length === 0) return Infinity;
  const mid = coords[Math.floor(coords.length / 2)]!;
  return haversineMeters(lat, lng, mid[1], mid[0]);
}

function sourceFor(
  scope: Input["scope"],
): { service: string; layer_id: number; attribution: string } | undefined {
  const attribution = "Datos: Ajuntament de València (CC BY 4.0).";
  if (scope === "tramos") return { service: SERVICE, layer_id: LAYER_TRAMOS, attribution };
  if (scope === "intensity")
    return { service: SERVICE, layer_id: LAYER_INTENSITY, attribution };
  if (scope === "cameras") return { service: SERVICE, layer_id: LAYER_CAMERAS, attribution };
  return undefined;
}

function jsonResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

export const __test__ = { toTramo, toCamera, toIntensityPoint };
