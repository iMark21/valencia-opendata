import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ArcgisClient } from "../clients/arcgis.js";
import { ArcgisError, GeoFeature } from "../types/arcgis.js";
import {
  utm30NToWgs84,
  haversineMeters,
  normalizeAccents,
} from "./_geo.js";

const BARRIS_SERVICE = "OPENDATA/UrbanismoEInfraestructuras";
const LAYER_BARRIS = 224;
const ENV_SERVICE = "OPENDATA/MedioAmbiente";
const LAYER_AIR = 156;
const LAYER_NOISE = 160;
const LAYER_GREEN = 8;

const TTL_LONG = 3600;
const TTL_SHORT = 60;

const DEFAULT_WEIGHTS = {
  air: 0.40,
  noise: 0.25,
  green: 0.20,
  vulnerability: 0.15,
};

const CAVEAT =
  "El score compuesto y los pesos son opinables. Revisar weights_used antes " +
  "de usar como métrica oficial. Aire y verde son live; ruido y " +
  "vulnerabilidad son aproximaciones (el portal solo expone medidas " +
  "puntuales en CSVs estáticos — el MCP no los procesa).";

const description =
  "Composite environmental pulse for a València neighborhood. Aggregates " +
  "air quality (live closest sensor), green-space ratio (live polygons), " +
  "noise station coverage (live count) and a vulnerability pointer. Returns " +
  "a 0-100 score with components and weights. The score is opinionated — " +
  "review weights_used before treating as official. Use compare_with for " +
  "side-by-side delta vs another barri.";

const inputSchema = {
  barri: z
    .string()
    .min(1)
    .describe("Neighborhood name (accent-insensitive, e.g. 'russafa', 'el carme')."),
  compare_with: z
    .string()
    .min(1)
    .optional()
    .describe("Optional second neighborhood to compare against."),
  weights: z
    .object({
      air: z.number().min(0).max(1).optional(),
      noise: z.number().min(0).max(1).optional(),
      green: z.number().min(0).max(1).optional(),
      vulnerability: z.number().min(0).max(1).optional(),
    })
    .optional()
    .describe(
      "Override default weights. Defaults: air 0.40, noise 0.25, green 0.20, vulnerability 0.15.",
    ),
};

type Input = {
  barri: string;
  compare_with?: string;
  weights?: Partial<typeof DEFAULT_WEIGHTS>;
};

type Component = {
  score: number | null;
  value: number | null;
  unit: string;
  basis: string;
  source: { service?: string; layer_id?: number; dataset_id?: string };
};

type Pulse = {
  barri: string;
  pulse_score: number | null;
  components: {
    air: Component;
    noise: Component;
    green: Component;
    vulnerability: Component;
  };
  weights_used: typeof DEFAULT_WEIGHTS;
  centroid: { lat: number; lng: number };
  computed_at: string;
};

export function registerGetNeighborhoodPulseTool(
  server: McpServer,
  arcgis: ArcgisClient,
): void {
  server.tool(
    "get_neighborhood_pulse",
    description,
    inputSchema,
    async (raw: Input) => {
      const args = raw;
      try {
        const barris = await fetchBarris(arcgis);
        const target = await resolvePulse(arcgis, args.barri, barris, args.weights);
        if ("error" in target) return jsonResult(target);

        if (args.compare_with) {
          const other = await resolvePulse(
            arcgis,
            args.compare_with,
            barris,
            args.weights,
          );
          if ("error" in other) return jsonResult(other);
          return jsonResult({
            comparison: {
              a: target,
              b: other,
              deltas: {
                pulse_score:
                  target.pulse_score !== null && other.pulse_score !== null
                    ? Math.round((target.pulse_score - other.pulse_score) * 10) / 10
                    : null,
                air:
                  scoreDelta(target.components.air.score, other.components.air.score),
                green:
                  scoreDelta(
                    target.components.green.score,
                    other.components.green.score,
                  ),
              },
            },
            weights_used: target.weights_used,
            caveat: CAVEAT,
            attribution: "Datos: Ajuntament de València (CC BY 4.0).",
          });
        }

        return jsonResult({
          ...target,
          caveat: CAVEAT,
          attribution: "Datos: Ajuntament de València (CC BY 4.0).",
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

async function resolvePulse(
  arcgis: ArcgisClient,
  query: string,
  barris: GeoFeature[],
  weightsOverride: Partial<typeof DEFAULT_WEIGHTS> | undefined,
): Promise<Pulse | { error: { code: string; message: string; suggestions?: string[] } }> {
  const target = normalizeAccents(query.replace(/-/g, " "));
  const match = barris.find((f) => normalizeAccents(String(f.attributes.nombre ?? "")) === target);
  if (!match) {
    return {
      error: {
        code: "unknown_barri",
        message: `No neighborhood matched "${query}".`,
      },
    };
  }

  const name = String(match.attributes.nombre ?? "");
  const centroid = barriCentroid(match);
  const areaM2 =
    typeof (match.attributes as Record<string, unknown>)["gis.gis.BARRIOS.area"] ===
    "number"
      ? ((match.attributes as Record<string, unknown>)[
          "gis.gis.BARRIOS.area"
        ] as number)
      : null;

  const [air, green, noise] = await Promise.all([
    computeAirComponent(arcgis, centroid),
    computeGreenComponent(arcgis, name, areaM2),
    computeNoiseComponent(arcgis, centroid),
  ]);
  const vulnerability = vulnerabilityComponent();

  const weights = { ...DEFAULT_WEIGHTS, ...(weightsOverride ?? {}) };
  const score = composite(
    [air, noise, green, vulnerability],
    [weights.air, weights.noise, weights.green, weights.vulnerability],
  );

  return {
    barri: name,
    pulse_score: score,
    components: { air, noise, green, vulnerability },
    weights_used: weights,
    centroid,
    computed_at: new Date().toISOString(),
  };
}

async function fetchBarris(arcgis: ArcgisClient): Promise<GeoFeature[]> {
  const r = await arcgis.queryLayer(BARRIS_SERVICE, LAYER_BARRIS, {
    where: "1=1",
    outFields: "*",
    returnGeometry: true,
    resultRecordCount: 200,
    ttlSeconds: TTL_LONG,
  });
  return r.features;
}

async function computeAirComponent(
  arcgis: ArcgisClient,
  centroid: { lat: number; lng: number },
): Promise<Component> {
  try {
    const r = await arcgis.queryLayer(ENV_SERVICE, LAYER_AIR, {
      where: "1=1",
      outFields: "*",
      ttlSeconds: TTL_SHORT,
    });
    let bestNo2: number | null = null;
    let bestDist = Infinity;
    for (const f of r.features) {
      const [lng, lat] = pointToWgs84(f);
      const d = haversineMeters(centroid.lat, centroid.lng, lat, lng);
      const v = f.attributes.no2;
      if (typeof v === "number" && Number.isFinite(v) && d < bestDist) {
        bestNo2 = v;
        bestDist = d;
      }
    }
    if (bestNo2 === null) return airNullComponent();
    // Score: NO2 µg/m³. WHO 2021 annual = 10. EU 2008 annual = 40.
    // Linear: 0 µg/m³ → 100, 40 µg/m³ → 50, 80+ → 0.
    const score = Math.max(0, Math.min(100, 100 - bestNo2 * 1.25));
    return {
      score: Math.round(score),
      value: bestNo2,
      unit: "µg/m³",
      basis: "Closest live NO₂ reading from layer 156 (WHO 10 / EU 40).",
      source: { service: ENV_SERVICE, layer_id: LAYER_AIR },
    };
  } catch {
    return airNullComponent();
  }
}

function airNullComponent(): Component {
  return {
    score: null,
    value: null,
    unit: "µg/m³",
    basis: "No live NO₂ reading reachable.",
    source: { service: ENV_SERVICE, layer_id: LAYER_AIR },
  };
}

async function computeGreenComponent(
  arcgis: ArcgisClient,
  barriName: string,
  barriAreaM2: number | null,
): Promise<Component> {
  try {
    const r = await arcgis.queryLayer(ENV_SERVICE, LAYER_GREEN, {
      where: `barrio='${barriName.replace(/'/g, "''")}'`,
      outFields: "sup_total,nombre,barrio",
      returnGeometry: false,
      resultRecordCount: 200,
      ttlSeconds: TTL_LONG,
    });
    let totalGreen = 0;
    let counted = 0;
    for (const f of r.features) {
      const v = f.attributes.sup_total;
      if (typeof v === "number" && Number.isFinite(v)) {
        totalGreen += v;
        counted++;
      }
    }
    if (counted === 0 || !barriAreaM2 || barriAreaM2 <= 0) {
      return {
        score: null,
        value: counted,
        unit: "count",
        basis:
          "No green-space records found, or barri area unknown — score not computable.",
        source: { service: ENV_SERVICE, layer_id: LAYER_GREEN },
      };
    }
    const ratio = totalGreen / barriAreaM2;
    // Score: 0% → 0, 5% → 50, 10%+ → 100. València averages ~6-8% green.
    const score = Math.max(0, Math.min(100, ratio * 1000));
    return {
      score: Math.round(score),
      value: Math.round(ratio * 10_000) / 100, // percentage with 2 decimals
      unit: "% of barri area",
      basis: `${counted} green spaces summing ${Math.round(totalGreen)} m² over ${Math.round(barriAreaM2)} m² of barri.`,
      source: { service: ENV_SERVICE, layer_id: LAYER_GREEN },
    };
  } catch {
    return {
      score: null,
      value: null,
      unit: "% of barri area",
      basis: "Green-space layer unreachable.",
      source: { service: ENV_SERVICE, layer_id: LAYER_GREEN },
    };
  }
}

async function computeNoiseComponent(
  arcgis: ArcgisClient,
  centroid: { lat: number; lng: number },
): Promise<Component> {
  // The portal only exposes static CSVs for noise readings (mapas.valencia.es/
  // .../ruido.csv). The MCP does not download/parse those, so we report
  // station coverage in a 1km radius as a proxy and the LLM can fetch the CSV
  // directly if it needs the actual decibels.
  try {
    const r = await arcgis.queryLayer(ENV_SERVICE, LAYER_NOISE, {
      where: "1=1",
      outFields: "objectid",
      ttlSeconds: TTL_LONG,
    });
    let nearby = 0;
    for (const f of r.features) {
      const [lng, lat] = pointToWgs84(f);
      const d = haversineMeters(centroid.lat, centroid.lng, lat, lng);
      if (d <= 1000) nearby++;
    }
    return {
      score: null,
      value: nearby,
      unit: "stations within 1 km",
      basis:
        "Noise readings live only in static CSV at mapas.valencia.es. " +
        "The MCP does not download it; this is a station-coverage proxy.",
      source: { service: ENV_SERVICE, layer_id: LAYER_NOISE },
    };
  } catch {
    return {
      score: null,
      value: null,
      unit: "stations within 1 km",
      basis: "Noise layer unreachable.",
      source: { service: ENV_SERVICE, layer_id: LAYER_NOISE },
    };
  }
}

function vulnerabilityComponent(): Component {
  return {
    score: null,
    value: null,
    unit: "index",
    basis:
      "Vulnerability is delivered only as a static CSV/GeoJSON. The MCP " +
      "does not parse it; fetch the dataset 'vulnerabilidad-por-barrios' " +
      "client-side if needed.",
    source: { dataset_id: "vulnerabilidad-por-barrios" },
  };
}

function composite(
  components: Component[],
  weights: number[],
): number | null {
  let sum = 0;
  let totalWeight = 0;
  for (let i = 0; i < components.length; i++) {
    const c = components[i]!;
    const w = weights[i] ?? 0;
    if (typeof c.score !== "number") continue;
    sum += c.score * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return null;
  return Math.round((sum / totalWeight) * 10) / 10;
}

function scoreDelta(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.round((a - b) * 10) / 10;
}

function pointToWgs84(f: GeoFeature): [number, number] {
  if (f.geometry?.type !== "Point") return [0, 0];
  const [x, y] = f.geometry.coordinates;
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return [x, y];
  return utm30NToWgs84(x, y);
}

function barriCentroid(f: GeoFeature): { lat: number; lng: number } {
  let coords: Array<[number, number]> = [];
  if (f.geometry?.type === "Polygon" && f.geometry.coordinates.length > 0) {
    coords = f.geometry.coordinates[0]!;
  } else if (
    f.geometry?.type === "MultiPolygon" &&
    f.geometry.coordinates.length > 0 &&
    f.geometry.coordinates[0]!.length > 0
  ) {
    coords = f.geometry.coordinates[0]![0]!;
  }
  if (coords.length === 0) return { lat: 0, lng: 0 };
  const [x0, y0] = coords[0]!;
  const projected =
    Math.abs(x0) <= 180 && Math.abs(y0) <= 90
      ? coords
      : coords.map(([x, y]) => utm30NToWgs84(x, y));
  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of projected) {
    sumLng += lng;
    sumLat += lat;
  }
  return {
    lat: sumLat / projected.length,
    lng: sumLng / projected.length,
  };
}

function jsonResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

export const __test__ = { composite, vulnerabilityComponent, DEFAULT_WEIGHTS };
