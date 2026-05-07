import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import {
  registerGetEmtStopsTool,
  __test__,
} from "../src/tools/get_emt_stops.js";

type StopStub = {
  id_parada: number;
  denominacion: string;
  lineas: string;
  suprimida?: 0 | 1;
  proximas_llegadas?: string;
  // UTM30N (EPSG:25830)
  x: number;
  y: number;
};

function fakeFetch(stops: StopStub[]): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const m = /\/MapServer\/(\d+)\/query/.exec(url.pathname);
    if (!m || Number(m[1]) !== 226) {
      return new Response("nf", { status: 404 });
    }
    return new Response(
      JSON.stringify({
        features: stops.map((s) => ({
          attributes: {
            id_parada: s.id_parada,
            denominacion: s.denominacion,
            lineas: s.lineas,
            suprimida: s.suprimida ?? 0,
            proximas_llegadas:
              s.proximas_llegadas ??
              `http://www.emtvalencia.es/QR.php?sec=est&p=${s.id_parada}`,
          },
          geometry: { x: s.x, y: s.y },
        })),
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
}

async function harness(stops: StopStub[]) {
  const arcgis = new ArcgisClient({
    fetchImpl: fakeFetch(stops),
    baseURL: "https://example.test/server/rest/services/",
  });
  const server = new McpServer({ name: "t", version: "0.0.0" });
  registerGetEmtStopsTool(server, arcgis);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(s), client.connect(c)]);
  return {
    call: async (args: Record<string, unknown>) => {
      const res = await client.callTool({
        name: "get_emt_stops",
        arguments: args,
      });
      return JSON.parse(
        (res.content as Array<{ text: string }>)[0]?.text ?? "{}",
      );
    },
    close: () => client.close(),
  };
}

// Approx UTM30N coordinates near Plaça de l'Ajuntament
const NEAR_AYTO_UTM = { x: 725800, y: 4372100 };
const FAR_UTM = { x: 740000, y: 4380000 };

describe("get_emt_stops — parseLines", () => {
  it("splits comma, slash, semicolon and whitespace", () => {
    expect(__test__.parseLines("62")).toEqual(["62"]);
    expect(__test__.parseLines("10, 12, N1")).toEqual(["10", "12", "N1"]);
    expect(__test__.parseLines("10/12")).toEqual(["10", "12"]);
    expect(__test__.parseLines("10;12 ;14")).toEqual(["10", "12", "14"]);
    expect(__test__.parseLines("")).toEqual([]);
    expect(__test__.parseLines(null)).toEqual([]);
  });
});

describe("get_emt_stops — tool", () => {
  it("requires near or linea", async () => {
    const h = await harness([]);
    try {
      const out = await h.call({});
      expect(out.error.code).toBe("requires_filter");
    } finally {
      await h.close();
    }
  });

  it("filters by linea (case-insensitive)", async () => {
    const h = await harness([
      { id_parada: 1, denominacion: "A", lineas: "10, 12", ...NEAR_AYTO_UTM },
      { id_parada: 2, denominacion: "B", lineas: "63", ...NEAR_AYTO_UTM },
      { id_parada: 3, denominacion: "C", lineas: "n1", ...NEAR_AYTO_UTM },
    ]);
    try {
      const out = await h.call({ linea: "12" });
      expect(out.stops.map((s: { id: number }) => s.id)).toEqual([1]);

      const nightOut = await h.call({ linea: "N1" });
      expect(nightOut.stops.map((s: { id: number }) => s.id)).toEqual([3]);
    } finally {
      await h.close();
    }
  });

  it("near sorts by distance and respects radius_m", async () => {
    const h = await harness([
      { id_parada: 100, denominacion: "Far", lineas: "10", ...FAR_UTM },
      { id_parada: 200, denominacion: "Close", lineas: "10", ...NEAR_AYTO_UTM },
    ]);
    try {
      const out = await h.call({
        near: { lat: 39.4699, lng: -0.3763, radius_m: 5000 },
      });
      expect(out.stops[0].id).toBe(200);
      expect(out.stops[0].distance_m).toBeLessThan(5000);
      expect(out.count).toBe(1);
    } finally {
      await h.close();
    }
  });

  it("excludes inactive by default, includes when asked", async () => {
    const h = await harness([
      { id_parada: 1, denominacion: "Active", lineas: "10", ...NEAR_AYTO_UTM },
      {
        id_parada: 2,
        denominacion: "Suprimida",
        lineas: "10",
        suprimida: 1,
        ...NEAR_AYTO_UTM,
      },
    ]);
    try {
      const def = await h.call({ linea: "10" });
      expect(def.stops.map((s: { id: number }) => s.id)).toEqual([1]);

      const all = await h.call({ linea: "10", include_inactive: true });
      expect(all.stops.map((s: { id: number }) => s.id).sort()).toEqual([1, 2]);
    } finally {
      await h.close();
    }
  });

  it("falls back to QR URL when proximas_llegadas missing", async () => {
    const h = await harness([
      {
        id_parada: 999,
        denominacion: "X",
        lineas: "10",
        proximas_llegadas: "",
        ...NEAR_AYTO_UTM,
      },
    ]);
    try {
      const out = await h.call({ linea: "10" });
      expect(out.stops[0].arrivals_url).toBe(
        "http://www.emtvalencia.es/QR.php?sec=est&p=999",
      );
    } finally {
      await h.close();
    }
  });
});
