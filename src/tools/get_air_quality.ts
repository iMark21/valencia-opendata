import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ArcgisClient } from "../clients/arcgis.js";
import { ArcgisError, GeoFeature } from "../types/arcgis.js";
import {
  utm30NToWgs84,
  haversineMeters,
  normalizeAccents,
} from "./_geo.js";

const STATIONS_SERVICE = "OPENDATA/MedioAmbiente";
const STATIONS_LAYER_ID = 156;
const HISTORY_DATASET_ID = "hourly-air-quality-data-since-2016";
const HISTORY_RESOURCE_URL =
  "https://opendata.vlci.valencia.es/dataset/" +
  "b5c2656c-6c1c-413d-a56e-549e52220502/resource/" +
  "4be7248b-9597-4017-89af-82a9b6e2382f/download/" +
  "rvvcca.-datos-horarios-valencia-2016-2021-curt-cas.csv";
const HISTORY_RESOURCE_BYTES = 47_877_130;

const POLLUTANTS = ["no2", "pm10", "pm25", "o3", "so2", "co", "all"] as const;
type Pollutant = (typeof POLLUTANTS)[number];

// WHO 2021 / EU 2008 annual thresholds (µg/m³). For CO the EU 8-hour limit
// is mg/m³. Useful as orientation; the LLM should still cite when used.
const THRESHOLDS = {
  no2: { who_annual: 10, eu_annual: 40, unit: "µg/m³" },
  pm10: { who_annual: 15, eu_annual: 40, unit: "µg/m³" },
  pm25: { who_annual: 5, eu_annual: 25, unit: "µg/m³" },
  o3: { who_8h: 100, eu_8h: 120, unit: "µg/m³" },
  so2: { who_24h: 40, eu_24h: 125, unit: "µg/m³" },
  co: { eu_8h: 10, unit: "mg/m³" },
} as const;

const description =
  "Live air-quality readings for València's monitoring stations (RVVCCA). " +
  "Queries the Geoportal layer 156 for the most recent measurement of every " +
  "station and pollutant (NO2, PM10, PM2.5, O3, SO2, CO). Returns sensor " +
  "values with lat/lng (WGS84), measured_at and threshold orientation " +
  "(WHO 2021 / EU 2008). For history (since 2016) use the returned " +
  "history_pointer — the MCP never downloads the 47MB CSV.";

const inputSchema = {
  station: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Station name slug (e.g. 'centro', 'francia', 'molí-del-sol'). " +
        "Use 'all' or omit to get every station. Accent-insensitive.",
    ),
  pollutant: z
    .enum(POLLUTANTS)
    .optional()
    .describe(
      "Restrict pollutants. Default 'all'. Use 'no2'|'pm10'|'pm25'|'o3'|'so2'|'co'.",
    ),
  near: z
    .object({ lat: z.number(), lng: z.number() })
    .optional()
    .describe(
      "Latitude/longitude (WGS84). Returns only the closest station with distance_m.",
    ),
  include_history_pointer: z
    .boolean()
    .optional()
    .describe("Default true. When true, emit a pointer to the historic CSV."),
};

type Input = {
  station?: string;
  pollutant?: Pollutant;
  near?: { lat: number; lng: number };
  include_history_pointer?: boolean;
};

type Reading = {
  pollutant: Exclude<Pollutant, "all">;
  value: number;
  unit: string;
  thresholds: Record<string, number | string>;
};

type StationReport = {
  code: string | null;
  name: string;
  address: string | null;
  zone_type: string | null;
  emission_type: string | null;
  air_quality_label: string | null;
  lat: number;
  lng: number;
  measured_at: string | null;
  readings: Reading[];
  distance_m?: number;
  source: { dataset_id: string; source_url: string };
};

export function registerGetAirQualityTool(
  server: McpServer,
  arcgis: ArcgisClient,
): void {
  server.tool(
    "get_air_quality",
    description,
    inputSchema,
    async (raw: Input) => {
      const args = raw ?? {};
      try {
        const stations = await fetchStations(arcgis);
        if (stations.length === 0) {
          return jsonResult({
            error: {
              code: "no_stations",
              message:
                "No air-quality stations returned by the live layer.",
            },
          });
        }

        const reports = stations.map((s) =>
          toStationReport(s, args.pollutant ?? "all"),
        );

        let filtered = reports;

        if (args.near) {
          const { lat, lng } = args.near;
          const withDistance = reports.map((r) => ({
            ...r,
            distance_m: haversine(lat, lng, r.lat, r.lng),
          }));
          withDistance.sort((a, b) => a.distance_m - b.distance_m);
          filtered = [withDistance[0]!];
        } else if (args.station && args.station.toLowerCase() !== "all") {
          const target = normalize(args.station);
          filtered = reports.filter(
            (r) =>
              normalize(r.name).includes(target) ||
              (r.code && normalize(r.code).includes(target)),
          );
          if (filtered.length === 0) {
            return jsonResult({
              error: {
                code: "unknown_station",
                message: `No station matched "${args.station}".`,
                suggestions: {
                  valid_stations: reports.map((r) => ({
                    code: r.code,
                    name: r.name,
                  })),
                },
              },
            });
          }
        }

        const includeHistory = args.include_history_pointer !== false;

        return jsonResult({
          stations: filtered,
          ...(includeHistory ? { history_pointer: historyPointer() } : {}),
          source: {
            endpoint:
              "https://geoportal.valencia.es/server/rest/services/" +
              `${STATIONS_SERVICE}/MapServer/${STATIONS_LAYER_ID}/query`,
            attribution:
              "Datos: Ajuntament de València · RVVCCA (CC BY 4.0).",
          },
        });
      } catch (err) {
        if (err instanceof ArcgisError) {
          return jsonResult({
            error: {
              code: "arcgis_error",
              message: err.message,
              http_status: err.httpStatus,
            },
          });
        }
        throw err;
      }
    },
  );
}

async function fetchStations(arcgis: ArcgisClient): Promise<GeoFeature[]> {
  // outSR=4326 asks ArcGIS to project geometries to WGS84 — saves us from
  // doing UTM 30N → WGS84 conversion in code.
  const result = await arcgis.queryLayer(
    STATIONS_SERVICE,
    STATIONS_LAYER_ID,
    {
      where: "1=1",
      outFields: "*",
      // force the response geometry to WGS84
      f: "json",
      ttlSeconds: 60,
    } as Parameters<ArcgisClient["queryLayer"]>[2],
  );
  // The client doesn't expose outSR directly. Workaround: query already in
  // EPSG:25830 and convert. Fall back if features come back in WGS84.
  return result.features.map(reproject);
}

function reproject(f: GeoFeature): GeoFeature {
  if (!f.geometry || f.geometry.type !== "Point") return f;
  const [x, y] = f.geometry.coordinates;
  // Heuristic: WGS84 longitudes are ~-180..180, UTM30N x is ~600_000..800_000.
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return f;
  const [lng, lat] = utm30NToWgs84(x, y);
  return {
    ...f,
    geometry: { type: "Point", coordinates: [lng, lat] },
  };
}

function toStationReport(f: GeoFeature, want: Pollutant): StationReport {
  const a = f.attributes;
  const code = (a.fiwareid as string | null | undefined) ?? null;
  const name = (a.nombre as string | null | undefined) ?? "(unnamed)";
  const measuredAt = isoFromEpoch(a.fecha_carg);

  const [lng, lat] =
    f.geometry?.type === "Point" ? f.geometry.coordinates : [0, 0];

  const allReadings: Reading[] = [];
  for (const p of ["no2", "pm10", "pm25", "o3", "so2", "co"] as const) {
    const v = a[p];
    if (typeof v === "number" && Number.isFinite(v)) {
      allReadings.push({
        pollutant: p,
        value: v,
        unit: THRESHOLDS[p].unit,
        thresholds: THRESHOLDS[p],
      });
    }
  }

  const readings =
    want === "all"
      ? allReadings
      : allReadings.filter((r) => r.pollutant === want);

  return {
    code,
    name,
    address: (a.direccion as string | null | undefined) ?? null,
    zone_type: (a.tipozona as string | null | undefined) ?? null,
    emission_type: (a.tipoemisio as string | null | undefined) ?? null,
    air_quality_label: (a.calidad_am as string | null | undefined) ?? null,
    lat,
    lng,
    measured_at: measuredAt,
    readings,
    source: {
      dataset_id: HISTORY_DATASET_ID,
      source_url:
        "https://geoportal.valencia.es/server/rest/services/" +
        `${STATIONS_SERVICE}/MapServer/${STATIONS_LAYER_ID}`,
    },
  };
}

function isoFromEpoch(v: unknown): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return new Date(v).toISOString();
}

function historyPointer() {
  return {
    dataset_id: HISTORY_DATASET_ID,
    resource_url: HISTORY_RESOURCE_URL,
    size_bytes: HISTORY_RESOURCE_BYTES,
    note:
      "Histórico desde 2016 (≈47 MB). Descarga directa por el cliente. " +
      "El MCP no procesa el archivo.",
  };
}

const haversine = haversineMeters;
const normalize = normalizeAccents;

function jsonResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

export const __test__ = { utm30NToWgs84, haversine, historyPointer, normalize };
