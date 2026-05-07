import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CkanClient } from "../clients/ckan.js";
import { ArcgisClient } from "../clients/arcgis.js";
import { ArcgisError, GeoFeature } from "../types/arcgis.js";
import { utm30NToWgs84, normalizeAccents } from "./_geo.js";

const SERVICE = "OPENDATA/UrbanismoEInfraestructuras";
const LAYER_BARRIS = 224;
const LAYER_DISTRICTS = 225;
const TTL_LONG = 3600;

const description =
  "Returns territorial metadata for a València neighborhood (barri): " +
  "geometry centroid + bbox, district name, area, and live pointers to " +
  "static enrichment datasets (vulnerability, income, parking). Resolve a " +
  "neighborhood by `barri` (slug, accent-insensitive) or by `at` " +
  "(lat/lng → point-in-polygon). Use `list_all: true` for the slim catalog.";

const inputSchema = {
  barri: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Neighborhood name or slug (accent-insensitive). E.g. 'russafa', 'el carme', 'benimaclet'.",
    ),
  at: z
    .object({ lat: z.number(), lng: z.number() })
    .optional()
    .describe("WGS84 point — resolves to the containing neighborhood."),
  list_all: z
    .boolean()
    .optional()
    .describe("When true, returns a slim list of all neighborhoods."),
};

type Input = {
  barri?: string;
  at?: { lat: number; lng: number };
  list_all?: boolean;
};

type DistrictMap = Map<string, string>;

type Centroid = { lat: number; lng: number };
type Bbox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

type BarriInfo = {
  slug: string;
  name: string;
  district_code: string | null;
  district_name: string | null;
  bardistrict_code: string | null;
  area_m2: number | null;
  area_km2: number | null;
  centroid: Centroid;
  bbox: Bbox;
};

type BarriDetailed = BarriInfo & {
  source_datasets: Array<{ id: string; purpose: string; url: string }>;
};

const ENRICHMENT_DATASETS: Array<{ id: string; purpose: string; url: string }> = [
  {
    id: "vulnerabilidad-por-barrios",
    purpose: "vulnerability_index_2021",
    url:
      "https://opendata.vlci.valencia.es/dataset/" +
      "vulnerabilidad-por-barrios",
  },
  {
    id: "income-per-household-and-person",
    purpose: "income_per_household_and_person",
    url:
      "https://opendata.vlci.valencia.es/dataset/" +
      "income-per-household-and-person",
  },
  {
    id: "car-parks-by-districts-neighborhoods",
    purpose: "parking_capacity_by_district",
    url:
      "https://opendata.vlci.valencia.es/dataset/" +
      "car-parks-by-districts-neighborhoods",
  },
  {
    id: "barris-policials-barrios-policiales",
    purpose: "police_neighborhood_division",
    url:
      "https://opendata.vlci.valencia.es/dataset/" +
      "barris-policials-barrios-policiales",
  },
];

export type NeighborhoodDeps = {
  arcgis: ArcgisClient;
  ckan?: CkanClient;
};

export function registerGetNeighborhoodInfoTool(
  server: McpServer,
  deps: NeighborhoodDeps,
): void {
  server.tool(
    "get_neighborhood_info",
    description,
    inputSchema,
    async (raw: Input) => {
      const args = raw ?? {};

      // Validate exactly-one (or zero for list_all)
      const inputs = [args.barri, args.at, args.list_all].filter(
        (v) => v !== undefined,
      );
      if (inputs.length === 0) {
        return jsonResult({
          error: {
            code: "invalid_input",
            message:
              "Pass `barri`, `at` (lat/lng), or `list_all: true` — pick one.",
          },
        });
      }
      if (inputs.length > 1) {
        return jsonResult({
          error: {
            code: "invalid_input",
            message:
              "barri, at and list_all are mutually exclusive — pass one.",
          },
        });
      }

      try {
        const [features, districts] = await Promise.all([
          fetchBarriFeatures(deps.arcgis),
          fetchDistrictMap(deps.arcgis),
        ]);
        const barris = features.map((f) => toBarriInfo(f, districts));

        if (args.list_all) {
          const slim = barris.map((b) => ({
            slug: b.slug,
            name: b.name,
            district_name: b.district_name,
            centroid: b.centroid,
          }));
          return jsonResult({
            count: slim.length,
            barris: slim,
            source: { service: SERVICE, layer_id: LAYER_BARRIS },
          });
        }

        if (args.at) {
          const containing = features.find((f) =>
            pointInPolygon(args.at!.lat, args.at!.lng, f),
          );
          if (!containing) {
            return jsonResult({
              error: {
                code: "out_of_scope",
                message:
                  "No València neighborhood contains that point. Scope is the municipal term only.",
              },
            });
          }
          const info = toBarriInfo(containing, districts);
          return jsonResult(detailed(info));
        }

        // barri lookup
        const target = normalizeAccents(args.barri!.replace(/-/g, " "));
        const match = barris.find((b) => normalizeAccents(b.name) === target);
        if (!match) {
          const suggestions = suggestBarris(args.barri!, barris);
          return jsonResult({
            error: {
              code: "unknown_barri",
              message: `No neighborhood matched "${args.barri}".`,
              suggestions,
            },
          });
        }
        return jsonResult(detailed(match));
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

function detailed(b: BarriInfo): BarriDetailed {
  return { ...b, source_datasets: ENRICHMENT_DATASETS };
}

async function fetchBarriFeatures(arcgis: ArcgisClient): Promise<GeoFeature[]> {
  const result = await arcgis.queryLayer(SERVICE, LAYER_BARRIS, {
    where: "1=1",
    outFields: "*",
    returnGeometry: true,
    resultRecordCount: 200,
    ttlSeconds: TTL_LONG,
  });
  return result.features;
}

async function fetchDistrictMap(arcgis: ArcgisClient): Promise<DistrictMap> {
  const map: DistrictMap = new Map();
  try {
    const result = await arcgis.queryLayer(SERVICE, LAYER_DISTRICTS, {
      where: "1=1",
      outFields: "coddistrit,nombre",
      returnGeometry: false,
      resultRecordCount: 100,
      ttlSeconds: TTL_LONG,
    });
    for (const f of result.features) {
      const code = String(f.attributes.coddistrit ?? "");
      const name = String(f.attributes.nombre ?? "");
      if (code && name) map.set(code, name);
    }
  } catch {
    // Districts are optional — we still return barri info without district name.
  }
  return map;
}

function toBarriInfo(f: GeoFeature, districts: DistrictMap): BarriInfo {
  const a = f.attributes;
  const name = (a.nombre as string | undefined)?.trim() ?? "";
  const districtCode = (a.coddistrit as string | undefined) ?? null;
  const areaM2 = (a as Record<string, unknown>)["gis.gis.BARRIOS.area"];
  const area = typeof areaM2 === "number" ? areaM2 : null;
  const polygon = polygonRingsToWgs84(f);
  return {
    slug: slugifyBarri(name),
    name,
    district_code: districtCode,
    district_name:
      districtCode !== null ? (districts.get(districtCode) ?? null) : null,
    bardistrict_code: (a.coddistbar as string | undefined) ?? null,
    area_m2: area,
    area_km2: area !== null ? Math.round((area / 1_000_000) * 100) / 100 : null,
    centroid: polygonCentroid(polygon),
    bbox: polygonBbox(polygon),
  };
}

function polygonRingsToWgs84(
  f: GeoFeature,
): Array<Array<[number, number]>> {
  if (!f.geometry) return [];
  if (f.geometry.type === "Polygon") {
    return f.geometry.coordinates.map((ring) => projectRing(ring));
  }
  if (f.geometry.type === "MultiPolygon") {
    return f.geometry.coordinates.flat().map((ring) => projectRing(ring));
  }
  return [];
}

function projectRing(
  ring: Array<[number, number]>,
): Array<[number, number]> {
  if (ring.length === 0) return [];
  const [x0, y0] = ring[0]!;
  if (Math.abs(x0) <= 180 && Math.abs(y0) <= 90) return ring;
  return ring.map(([x, y]) => utm30NToWgs84(x, y));
}

function polygonCentroid(rings: Array<Array<[number, number]>>): Centroid {
  // Centroid of the largest ring approximated as the mean of vertices —
  // good enough for "where is this neighborhood roughly located" purposes
  // and avoids the planimetric area-weighted formula.
  let bestRing: Array<[number, number]> = [];
  for (const r of rings) if (r.length > bestRing.length) bestRing = r;
  if (bestRing.length === 0) return { lat: 0, lng: 0 };
  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of bestRing) {
    sumLng += lng;
    sumLat += lat;
  }
  return {
    lat: sumLat / bestRing.length,
    lng: sumLng / bestRing.length,
  };
}

function polygonBbox(rings: Array<Array<[number, number]>>): Bbox {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  if (minLat === Infinity) return { minLat: 0, minLng: 0, maxLat: 0, maxLng: 0 };
  return { minLat, minLng, maxLat, maxLng };
}

export function pointInPolygon(lat: number, lng: number, f: GeoFeature): boolean {
  const rings = polygonRingsToWgs84(f);
  for (const ring of rings) {
    if (rayCast(lat, lng, ring)) return true;
  }
  return false;
}

function rayCast(lat: number, lng: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function slugifyBarri(name: string): string {
  return normalizeAccents(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function suggestBarris(query: string, barris: BarriInfo[]): string[] {
  const target = normalizeAccents(query);
  const scored = barris
    .map((b) => ({ b, d: levenshtein(target, normalizeAccents(b.name)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);
  return scored.map((s) => s.b.name);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

function jsonResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

export const __test__ = {
  pointInPolygon,
  polygonCentroid,
  polygonBbox,
  slugifyBarri,
  suggestBarris,
};
