import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import {
  registerGetTrafficStateTool,
  __test__,
} from "../src/tools/get_traffic_state.js";

type Plan = {
  tramos?: Array<{
    idtramo: number;
    denominacion: string;
    estado: number;
    fiwareid?: string;
    paths: Array<Array<[number, number]>>;
  }>;
  intensity?: Array<{
    idpm: number;
    ih?: number | null;
    angulo?: number;
    last_edited_date?: number;
    x: number;
    y: number;
  }>;
  cameras?: Array<{
    idcamara: string;
    tipocamara?: string;
    descripcio?: string;
    url?: string;
    angulo?: number;
    x: number;
    y: number;
  }>;
};

function fakeFetch(plan: Plan): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const layerMatch = /\/MapServer\/(\d+)\/query/.exec(url.pathname);
    if (!layerMatch) return new Response("nf", { status: 404 });
    const layerId = Number(layerMatch[1]);

    if (layerId === 192) {
      return new Response(
        JSON.stringify({
          features: (plan.tramos ?? []).map((t) => ({
            attributes: {
              idtramo: t.idtramo,
              denominacion: t.denominacion,
              estado: t.estado,
              fiwareid: t.fiwareid ?? null,
            },
            geometry: { paths: t.paths },
          })),
          spatialReference: { wkid: 25830 },
        }),
        { status: 200 },
      );
    }
    if (layerId === 208) {
      return new Response(
        JSON.stringify({
          features: (plan.intensity ?? []).map((p) => ({
            attributes: {
              idpm: p.idpm,
              ih: p.ih ?? null,
              angulo: p.angulo ?? null,
              last_edited_date: p.last_edited_date ?? null,
            },
            geometry: { x: p.x, y: p.y },
          })),
        }),
        { status: 200 },
      );
    }
    if (layerId === 190) {
      return new Response(
        JSON.stringify({
          features: (plan.cameras ?? []).map((c) => ({
            attributes: {
              idcamara: c.idcamara,
              tipocamara: c.tipocamara ?? null,
              descripcio: c.descripcio ?? null,
              url: c.url ?? null,
              angulo: c.angulo ?? null,
            },
            geometry: { x: c.x, y: c.y },
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
  registerGetTrafficStateTool(server, arcgis);
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

describe("get_traffic_state tool", () => {
  it("AC2: tramos maps estado int → status string with WGS84 coords", async () => {
    const { client, close } = await harness({
      tramos: [
        {
          idtramo: 1,
          denominacion: "MAURO GUILLEN",
          estado: 0,
          paths: [[[725580, 4373900], [725700, 4373950]]],
        },
        {
          idtramo: 2,
          denominacion: "BLASCO IBÁÑEZ",
          estado: 2,
          paths: [[[725900, 4373900], [726100, 4373850]]],
        },
        {
          idtramo: 3,
          denominacion: "RONDA",
          estado: 9,
          paths: [[[726300, 4373800], [726500, 4373750]]],
        },
      ],
    });
    try {
      const res = await client.callTool({
        name: "get_traffic_state",
        arguments: { scope: "tramos" },
      });
      const out = parsePayload(res) as {
        scope: string;
        tramos: Array<{
          id: number;
          name: string;
          status: string;
          status_code: number;
          coords: Array<[number, number]>;
        }>;
      };
      expect(out.scope).toBe("tramos");
      const t1 = out.tramos.find((t) => t.id === 1);
      expect(t1?.status).toBe("fluido");
      const t2 = out.tramos.find((t) => t.id === 2);
      expect(t2?.status).toBe("congestionado");
      // Out-of-range estado falls back to "unknown"
      const t3 = out.tramos.find((t) => t.id === 3);
      expect(t3?.status).toBe("unknown");
      // Coords look like WGS84 lon/lat (~ -0.4, 39.4)
      const c0 = t1!.coords[0]!;
      expect(c0[0]).toBeGreaterThan(-0.5);
      expect(c0[0]).toBeLessThan(-0.3);
      expect(c0[1]).toBeGreaterThan(39.4);
      expect(c0[1]).toBeLessThan(39.5);
    } finally {
      await close();
    }
  });

  it("AC3: intensity returns vehicles_per_hour and last_reading_at", async () => {
    const { client, close } = await harness({
      intensity: [
        {
          idpm: 100,
          ih: 850,
          angulo: 90,
          last_edited_date: 1_777_900_000_000,
          x: 725580,
          y: 4373900,
        },
        {
          idpm: 101,
          ih: null,
          x: 728000,
          y: 4373000,
        },
      ],
    });
    try {
      const res = await client.callTool({
        name: "get_traffic_state",
        arguments: { scope: "intensity" },
      });
      const out = parsePayload(res) as {
        points: Array<{
          point_id: number;
          vehicles_per_hour: number | null;
          last_reading_at: string | null;
        }>;
      };
      const p100 = out.points.find((p) => p.point_id === 100);
      expect(p100?.vehicles_per_hour).toBe(850);
      expect(p100?.last_reading_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      const p101 = out.points.find((p) => p.point_id === 101);
      expect(p101?.vehicles_per_hour).toBeNull();
      expect(p101?.last_reading_at).toBeNull();
    } finally {
      await close();
    }
  });

  it("AC4: cameras include type, description, url and angle", async () => {
    const { client, close } = await harness({
      cameras: [
        {
          idcamara: "10411",
          tipocamara: "CF",
          descripcio: "PI Ramón i Cajal",
          url: "https://camaras.valencia.es/visualizador.html?id=10411",
          angulo: 271.47,
          x: 725465,
          y: 4371457,
        },
      ],
    });
    try {
      const res = await client.callTool({
        name: "get_traffic_state",
        arguments: { scope: "cameras" },
      });
      const out = parsePayload(res) as {
        cameras: Array<{
          id: string;
          type: string;
          url: string;
          angle_degrees: number;
        }>;
      };
      expect(out.cameras[0]?.id).toBe("10411");
      expect(out.cameras[0]?.type).toBe("CF");
      expect(out.cameras[0]?.url).toContain("camaras.valencia.es");
      expect(out.cameras[0]?.angle_degrees).toBe(271.47);
    } finally {
      await close();
    }
  });

  it("AC5: near filters cameras by radius and sorts by distance", async () => {
    const { client, close } = await harness({
      cameras: [
        // Centre area
        { idcamara: "near", x: 725580, y: 4373900 },
        // 5 km north
        { idcamara: "far", x: 725580, y: 4378900 },
      ],
    });
    try {
      const res = await client.callTool({
        name: "get_traffic_state",
        arguments: {
          scope: "cameras",
          near: { lat: 39.475, lng: -0.385, radius_m: 1500 },
        },
      });
      const out = parsePayload(res) as {
        cameras: Array<{ id: string; distance_m: number }>;
      };
      expect(out.cameras.map((c) => c.id)).toEqual(["near"]);
    } finally {
      await close();
    }
  });

  it("AC6: scope=all returns tramos + intensity + cameras keys", async () => {
    const { client, close } = await harness({
      tramos: [
        {
          idtramo: 1,
          denominacion: "T",
          estado: 1,
          paths: [[[725580, 4373900], [725700, 4373950]]],
        },
      ],
      intensity: [{ idpm: 1, ih: 100, x: 725580, y: 4373900 }],
      cameras: [{ idcamara: "1", x: 725580, y: 4373900 }],
    });
    try {
      const res = await client.callTool({
        name: "get_traffic_state",
        arguments: { scope: "all" },
      });
      const out = parsePayload(res) as Record<string, unknown>;
      expect(out.scope).toBe("all");
      expect((out.tramos as unknown[]).length).toBe(1);
      expect((out.intensity_points as unknown[]).length).toBe(1);
      expect((out.cameras as unknown[]).length).toBe(1);
    } finally {
      await close();
    }
  });
});

describe("traffic helpers", () => {
  it("toTramo handles missing fields gracefully", () => {
    const t = __test__.toTramo({
      attributes: {},
      geometry: { type: "LineString", coordinates: [] },
    });
    expect(t.id).toBeNull();
    expect(t.status).toBe("unknown");
    expect(t.coords).toEqual([]);
  });
});
