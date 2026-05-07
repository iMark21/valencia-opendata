import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import {
  registerGetNeighborhoodPulseTool,
  __test__,
} from "../src/tools/get_neighborhood_pulse.js";

type Stub = {
  barris?: Array<{
    nombre: string;
    area?: number;
    rings?: Array<Array<[number, number]>>;
  }>;
  airStations?: Array<{ nombre: string; no2: number; x: number; y: number }>;
  greenByBarri?: Record<string, Array<{ sup_total: number }>>;
  noisePoints?: Array<{ x: number; y: number }>;
};

function fakeFetch(stub: Stub): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const m = /\/MapServer\/(\d+)\/query/.exec(url.pathname);
    if (!m) return new Response("nf", { status: 404 });
    const layer = Number(m[1]);
    if (layer === 224) {
      return new Response(
        JSON.stringify({
          features: (stub.barris ?? []).map((b) => ({
            attributes: {
              nombre: b.nombre,
              "gis.gis.BARRIOS.area": b.area ?? null,
            },
            geometry: { rings: b.rings ?? [[[0.1, 0.2], [0.1, 0.3], [0.2, 0.2]]] },
          })),
        }),
        { status: 200 },
      );
    }
    if (layer === 156) {
      return new Response(
        JSON.stringify({
          features: (stub.airStations ?? []).map((s) => ({
            attributes: { nombre: s.nombre, no2: s.no2 },
            geometry: { x: s.x, y: s.y },
          })),
        }),
        { status: 200 },
      );
    }
    if (layer === 8) {
      const where = url.searchParams.get("where") ?? "";
      const matched = Object.entries(stub.greenByBarri ?? {}).find(([k]) =>
        where.toLowerCase().includes(k.toLowerCase()),
      );
      const items = matched ? matched[1] : [];
      return new Response(
        JSON.stringify({
          features: items.map((g) => ({
            attributes: { sup_total: g.sup_total },
          })),
        }),
        { status: 200 },
      );
    }
    if (layer === 160) {
      return new Response(
        JSON.stringify({
          features: (stub.noisePoints ?? []).map((p) => ({
            attributes: { objectid: 1 },
            geometry: { x: p.x, y: p.y },
          })),
        }),
        { status: 200 },
      );
    }
    return new Response("nf", { status: 404 });
  }) as unknown as typeof fetch;
}

async function harness(stub: Stub) {
  const arcgis = new ArcgisClient({
    fetchImpl: fakeFetch(stub),
    baseURL: "https://example.test/server/rest/services/",
  });
  const server = new McpServer({ name: "t", version: "0.0.0" });
  registerGetNeighborhoodPulseTool(server, arcgis);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(s), client.connect(c)]);
  return {
    call: async (args: Record<string, unknown>) => {
      const res = await client.callTool({
        name: "get_neighborhood_pulse",
        arguments: args,
      });
      return JSON.parse(
        (res.content as Array<{ text: string }>)[0]?.text ?? "{}",
      );
    },
    close: () => client.close(),
  };
}

describe("get_neighborhood_pulse — composite()", () => {
  it("re-normalizes weights when components are null", () => {
    const score = __test__.composite(
      [
        { score: 80, value: 10, unit: "x", basis: "", source: {} },
        { score: null, value: null, unit: "x", basis: "", source: {} },
        { score: 20, value: 5, unit: "x", basis: "", source: {} },
        { score: null, value: null, unit: "x", basis: "", source: {} },
      ],
      [0.4, 0.25, 0.2, 0.15],
    );
    // (80*0.4 + 20*0.2) / (0.4 + 0.2) = 36 / 0.6 = 60
    expect(score).toBe(60);
  });

  it("returns null when all components are null", () => {
    const score = __test__.composite(
      [
        { score: null, value: null, unit: "x", basis: "", source: {} },
        { score: null, value: null, unit: "x", basis: "", source: {} },
      ],
      [0.5, 0.5],
    );
    expect(score).toBeNull();
  });
});

describe("get_neighborhood_pulse — vulnerabilityComponent()", () => {
  it("is a static pointer with score=null and dataset_id source", () => {
    const v = __test__.vulnerabilityComponent();
    expect(v.score).toBeNull();
    expect(v.source.dataset_id).toBe("vulnerabilidad-por-barrios");
  });
});

describe("get_neighborhood_pulse — tool", () => {
  it("returns unknown_barri error when name does not match", async () => {
    const h = await harness({
      barris: [{ nombre: "RUSSAFA", area: 100_000 }],
    });
    try {
      const out = await h.call({ barri: "fake-barri-zzz" });
      expect(out.error.code).toBe("unknown_barri");
    } finally {
      await h.close();
    }
  });

  it("computes pulse with caveat and weights_used", async () => {
    const h = await harness({
      barris: [
        {
          nombre: "RUSSAFA",
          area: 1_000_000,
          rings: [
            [
              [0.1, 0.1],
              [0.1, 0.2],
              [0.2, 0.2],
              [0.2, 0.1],
              [0.1, 0.1],
            ],
          ],
        },
      ],
      airStations: [{ nombre: "Russafa", no2: 20, x: 0.15, y: 0.15 }],
      greenByBarri: { RUSSAFA: [{ sup_total: 30_000 }] },
      noisePoints: [],
    });
    try {
      const out = await h.call({ barri: "russafa" });
      expect(out.barri).toBe("RUSSAFA");
      expect(out.caveat).toMatch(/opinables/i);
      expect(out.weights_used).toEqual(__test__.DEFAULT_WEIGHTS);
      expect(out.components.air.score).toBeGreaterThanOrEqual(0);
      expect(out.components.air.score).toBeLessThanOrEqual(100);
      expect(out.components.green.score).not.toBeNull();
      // Vulnerability is always a pointer in Fase 1.
      expect(out.components.vulnerability.score).toBeNull();
      expect(typeof out.pulse_score).toBe("number");
    } finally {
      await h.close();
    }
  });

  it("compare_with returns deltas for both barris", async () => {
    const h = await harness({
      barris: [
        {
          nombre: "RUSSAFA",
          area: 1_000_000,
          rings: [
            [
              [0.1, 0.1],
              [0.1, 0.2],
              [0.2, 0.2],
              [0.2, 0.1],
              [0.1, 0.1],
            ],
          ],
        },
        {
          nombre: "EL CARME",
          area: 800_000,
          rings: [
            [
              [0.5, 0.5],
              [0.5, 0.6],
              [0.6, 0.6],
              [0.6, 0.5],
              [0.5, 0.5],
            ],
          ],
        },
      ],
      airStations: [
        { nombre: "Russafa", no2: 10, x: 0.15, y: 0.15 },
        { nombre: "Carme", no2: 30, x: 0.55, y: 0.55 },
      ],
      greenByBarri: {
        RUSSAFA: [{ sup_total: 50_000 }],
        "EL CARME": [{ sup_total: 5_000 }],
      },
    });
    try {
      const out = await h.call({ barri: "russafa", compare_with: "el-carme" });
      expect(out.comparison.a.barri).toBe("RUSSAFA");
      expect(out.comparison.b.barri).toBe("EL CARME");
      expect(typeof out.comparison.deltas.pulse_score).toBe("number");
    } finally {
      await h.close();
    }
  });
});
