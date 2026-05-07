import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import {
  registerGetNeighborhoodInfoTool,
  __test__,
} from "../src/tools/get_neighborhood_info.js";

type Plan = {
  barris?: Array<{
    nombre: string;
    coddistrit?: string;
    coddistbar?: string;
    "gis.gis.BARRIOS.area"?: number;
    rings: Array<Array<[number, number]>>;
  }>;
  districts?: Array<{ coddistrit: string; nombre: string }>;
};

function fakeFetch(plan: Plan): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const m = /\/MapServer\/(\d+)\/query/.exec(url.pathname);
    if (!m) return new Response("nf", { status: 404 });
    const layerId = Number(m[1]);
    if (layerId === 224) {
      return new Response(
        JSON.stringify({
          features: (plan.barris ?? []).map((b) => ({
            attributes: {
              nombre: b.nombre,
              coddistrit: b.coddistrit ?? null,
              coddistbar: b.coddistbar ?? null,
              "gis.gis.BARRIOS.area": b["gis.gis.BARRIOS.area"] ?? null,
            },
            geometry: { rings: b.rings },
          })),
        }),
        { status: 200 },
      );
    }
    if (layerId === 225) {
      return new Response(
        JSON.stringify({
          features: (plan.districts ?? []).map((d) => ({
            attributes: { coddistrit: d.coddistrit, nombre: d.nombre },
            geometry: null,
          })),
        }),
        { status: 200 },
      );
    }
    return new Response("nf", { status: 404 });
  }) as unknown as typeof fetch;
}

async function harness(plan: Plan) {
  const arcgis = new ArcgisClient({ fetchImpl: fakeFetch(plan) });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerGetNeighborhoodInfoTool(server, { arcgis });
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  return { client, close: () => client.close() };
}

function parsePayload(res: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const c = (res.content as Array<{ type: string; text: string }>)?.[0];
  return JSON.parse(c?.text ?? "{}");
}

// A square polygon centred on (39.475, -0.375) ≈ València centre, ~0.005°
// around. Coords below are already in WGS84 so the projection helper short-
// circuits.
const RUSSAFA_RING: Array<[number, number]> = [
  [-0.378, 39.456],
  [-0.368, 39.456],
  [-0.368, 39.466],
  [-0.378, 39.466],
  [-0.378, 39.456],
];
const CENTRE_RING: Array<[number, number]> = [
  [-0.380, 39.470],
  [-0.370, 39.470],
  [-0.370, 39.480],
  [-0.380, 39.480],
  [-0.380, 39.470],
];

const PLAN: Plan = {
  barris: [
    {
      nombre: "RUSSAFA",
      coddistrit: "2",
      coddistbar: "21",
      "gis.gis.BARRIOS.area": 1_200_000,
      rings: [RUSSAFA_RING],
    },
    {
      nombre: "EL CARME",
      coddistrit: "1",
      coddistbar: "11",
      "gis.gis.BARRIOS.area": 800_000,
      rings: [CENTRE_RING],
    },
  ],
  districts: [
    { coddistrit: "1", nombre: "CIUTAT VELLA" },
    { coddistrit: "2", nombre: "L'EIXAMPLE" },
  ],
};

describe("get_neighborhood_info tool", () => {
  it("AC2: barri lookup returns shape with district + centroid + bbox + source_datasets", async () => {
    const { client, close } = await harness(PLAN);
    try {
      const res = await client.callTool({
        name: "get_neighborhood_info",
        arguments: { barri: "russafa" },
      });
      const out = parsePayload(res) as {
        slug: string;
        name: string;
        district_name: string;
        district_code: string;
        area_km2: number;
        centroid: { lat: number; lng: number };
        bbox: { minLat: number; maxLat: number };
        source_datasets: Array<{ id: string }>;
      };
      expect(out.name).toBe("RUSSAFA");
      expect(out.slug).toBe("russafa");
      expect(out.district_code).toBe("2");
      expect(out.district_name).toBe("L'EIXAMPLE");
      expect(out.area_km2).toBe(1.2);
      expect(out.centroid.lat).toBeCloseTo(39.461, 2);
      expect(out.centroid.lng).toBeCloseTo(-0.373, 2);
      expect(out.source_datasets.map((d) => d.id)).toContain(
        "vulnerabilidad-por-barrios",
      );
    } finally {
      await close();
    }
  });

  it("AC3: at lat/lng resolves to the containing neighborhood via point-in-polygon", async () => {
    const { client, close } = await harness(PLAN);
    try {
      // (39.461, -0.373) is inside RUSSAFA_RING
      const res = await client.callTool({
        name: "get_neighborhood_info",
        arguments: { at: { lat: 39.461, lng: -0.373 } },
      });
      const out = parsePayload(res) as { name: string };
      expect(out.name).toBe("RUSSAFA");
    } finally {
      await close();
    }
  });

  it("AC3: at outside any València polygon returns out_of_scope", async () => {
    const { client, close } = await harness(PLAN);
    try {
      // Madrid coords
      const res = await client.callTool({
        name: "get_neighborhood_info",
        arguments: { at: { lat: 40.4168, lng: -3.7038 } },
      });
      const out = parsePayload(res) as { error?: { code: string } };
      expect(out.error?.code).toBe("out_of_scope");
    } finally {
      await close();
    }
  });

  it("AC4: list_all returns slim entries with name + district + centroid", async () => {
    const { client, close } = await harness(PLAN);
    try {
      const res = await client.callTool({
        name: "get_neighborhood_info",
        arguments: { list_all: true },
      });
      const out = parsePayload(res) as {
        count: number;
        barris: Array<{ name: string; district_name: string; centroid: object }>;
      };
      expect(out.count).toBe(2);
      const names = out.barris.map((b) => b.name).sort();
      expect(names).toEqual(["EL CARME", "RUSSAFA"]);
    } finally {
      await close();
    }
  });

  it("unknown barri returns suggestions ranked by levenshtein", async () => {
    const { client, close } = await harness(PLAN);
    try {
      const res = await client.callTool({
        name: "get_neighborhood_info",
        arguments: { barri: "rusafa" },
      });
      const out = parsePayload(res) as {
        error?: { code: string; suggestions: string[] };
      };
      expect(out.error?.code).toBe("unknown_barri");
      expect(out.error?.suggestions[0]).toBe("RUSSAFA");
    } finally {
      await close();
    }
  });

  it("rejects passing both barri and at", async () => {
    const { client, close } = await harness(PLAN);
    try {
      const res = await client.callTool({
        name: "get_neighborhood_info",
        arguments: { barri: "russafa", at: { lat: 39, lng: 0 } },
      });
      const out = parsePayload(res) as { error?: { code: string } };
      expect(out.error?.code).toBe("invalid_input");
    } finally {
      await close();
    }
  });

  it("rejects empty input", async () => {
    const { client, close } = await harness(PLAN);
    try {
      const res = await client.callTool({
        name: "get_neighborhood_info",
        arguments: {},
      });
      const out = parsePayload(res) as { error?: { code: string } };
      expect(out.error?.code).toBe("invalid_input");
    } finally {
      await close();
    }
  });
});

describe("polygon helpers", () => {
  it("pointInPolygon detects containment and rejection", () => {
    const f = {
      attributes: {},
      geometry: { type: "Polygon" as const, coordinates: [RUSSAFA_RING] },
    };
    expect(__test__.pointInPolygon(39.461, -0.373, f)).toBe(true);
    expect(__test__.pointInPolygon(40, 0, f)).toBe(false);
  });

  it("centroid of a square is its arithmetic mean", () => {
    const c = __test__.polygonCentroid([RUSSAFA_RING]);
    expect(c.lat).toBeCloseTo(39.461, 2);
    expect(c.lng).toBeCloseTo(-0.373, 2);
  });

  it("bbox covers all vertices", () => {
    const b = __test__.polygonBbox([RUSSAFA_RING]);
    expect(b.minLat).toBeCloseTo(39.456);
    expect(b.maxLat).toBeCloseTo(39.466);
    expect(b.minLng).toBeCloseTo(-0.378);
    expect(b.maxLng).toBeCloseTo(-0.368);
  });

  it("slugifyBarri normalizes accents and spaces", () => {
    expect(__test__.slugifyBarri("RUSSAFA")).toBe("russafa");
    expect(__test__.slugifyBarri("El Carme")).toBe("el-carme");
    expect(__test__.slugifyBarri("Ciutat Vella")).toBe("ciutat-vella");
  });
});
