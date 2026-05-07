import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import {
  registerGetValenbisiTool,
  __test__,
} from "../src/tools/get_valenbisi_availability.js";

type Stub = {
  number: number;
  name: string;
  address?: string;
  open: "T" | "F";
  available: number;
  free: number;
  total: number;
  update_jcd: number;
  x: number;
  y: number;
};

function fakeFetch(stations: Stub[]): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    if (!url.pathname.includes("/MapServer/228/query")) {
      return new Response("not found", { status: 404 });
    }
    const where = url.searchParams.get("where") ?? "1=1";
    const matchId = /^number=(\d+)$/.exec(where);
    let filtered = stations;
    if (matchId) {
      const id = Number(matchId[1]);
      filtered = stations.filter((s) => s.number === id);
    }
    return new Response(
      JSON.stringify({
        features: filtered.map((s) => ({
          attributes: {
            number: s.number,
            name: s.name,
            address: s.address ?? null,
            open: s.open,
            available: s.available,
            free: s.free,
            total: s.total,
            update_jcd: s.update_jcd,
          },
          geometry: { x: s.x, y: s.y },
        })),
        spatialReference: { wkid: 25830 },
        exceededTransferLimit: false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

async function harness(stations: Stub[]) {
  const arcgis = new ArcgisClient({ fetchImpl: fakeFetch(stations) });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerGetValenbisiTool(server, arcgis);
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

const TS = 1_777_900_000_000;

const SAMPLES: Stub[] = [
  {
    number: 1,
    name: "001_GUILLEN_DE_CASTRO",
    open: "T",
    available: 5,
    free: 20,
    total: 25,
    update_jcd: TS,
    x: 725580,
    y: 4373900,
  },
  {
    number: 2,
    name: "002_PLAZA_DE_LA_REINA",
    open: "T",
    available: 0,
    free: 25,
    total: 25,
    update_jcd: TS,
    x: 725900,
    y: 4373900,
  },
  {
    number: 3,
    name: "003_BENIMACLET",
    open: "F",
    available: 12,
    free: 13,
    total: 25,
    update_jcd: TS,
    x: 727500,
    y: 4376500,
  },
];

describe("get_valenbisi_availability tool", () => {
  it("AC2: shape contains stations[] + source + data_freshness_seconds", async () => {
    const { client, close } = await harness(SAMPLES);
    try {
      const res = await client.callTool({
        name: "get_valenbisi_availability",
        arguments: { only_available: false },
      });
      const out = parsePayload(res) as {
        stations: Array<{
          id: number;
          name: string;
          bikes_available: number;
          docks_free: number;
          bikes_total: number;
          status: string;
          last_updated_at: string;
          lat: number;
          lng: number;
        }>;
        source: { service: string; layer_id: number };
        data_freshness_seconds: number;
      };
      expect(out.source.service).toBe("OPENDATA/Trafico");
      expect(out.source.layer_id).toBe(228);
      expect(out.data_freshness_seconds).toBe(30);
      expect(out.stations).toHaveLength(3);
      expect(out.stations[0]?.name).toBe("Guillen de Castro");
      expect(out.stations[0]?.lat).toBeCloseTo(39.47, 1);
    } finally {
      await close();
    }
  });

  it("AC5: only_available=true (default) hides closed and zero-bike stations", async () => {
    const { client, close } = await harness(SAMPLES);
    try {
      const res = await client.callTool({
        name: "get_valenbisi_availability",
        arguments: {},
      });
      const out = parsePayload(res) as {
        stations: Array<{ id: number; name: string }>;
      };
      // Only station 1 (open + 5 bikes) survives
      expect(out.stations).toHaveLength(1);
      expect(out.stations[0]?.id).toBe(1);
    } finally {
      await close();
    }
  });

  it("AC1+AC5: near sorts by distance and respects radius_m", async () => {
    const { client, close } = await harness(SAMPLES);
    try {
      // Close to station 1 (Guillen de Castro)
      const res = await client.callTool({
        name: "get_valenbisi_availability",
        arguments: {
          near: { lat: 39.475, lng: -0.385, radius_m: 1500 },
          only_available: false,
        },
      });
      const out = parsePayload(res) as {
        stations: Array<{ id: number; distance_m: number }>;
      };
      // Stations 1 and 2 within 1.5km, station 3 ~3km away
      expect(out.stations.map((s) => s.id)).not.toContain(3);
      // Sort ascending by distance
      const dists = out.stations.map((s) => s.distance_m);
      const sorted = [...dists].sort((a, b) => a - b);
      expect(dists).toEqual(sorted);
    } finally {
      await close();
    }
  });

  it("AC1: station_id passes where=number=N to ArcGIS", async () => {
    const { client, close } = await harness(SAMPLES);
    try {
      const res = await client.callTool({
        name: "get_valenbisi_availability",
        arguments: { station_id: 2, only_available: false },
      });
      const out = parsePayload(res) as {
        stations: Array<{ id: number }>;
      };
      expect(out.stations).toHaveLength(1);
      expect(out.stations[0]?.id).toBe(2);
    } finally {
      await close();
    }
  });

  it("rejects near + station_id", async () => {
    const { client, close } = await harness(SAMPLES);
    try {
      const res = await client.callTool({
        name: "get_valenbisi_availability",
        arguments: {
          station_id: 1,
          near: { lat: 39.47, lng: -0.37 },
        },
      });
      const out = parsePayload(res) as { error?: { code: string } };
      expect(out.error?.code).toBe("invalid_input");
    } finally {
      await close();
    }
  });
});

describe("name prettifier", () => {
  it("strips numeric prefix and title-cases keeping connectors lowercased", () => {
    expect(__test__.prettyStationName("001_GUILLEN_DE_CASTRO")).toBe(
      "Guillen de Castro",
    );
    expect(__test__.prettyStationName("002_PLAZA_DE_LA_REINA")).toBe(
      "Plaza de la Reina",
    );
    expect(__test__.prettyStationName("099_BENIMACLET")).toBe("Benimaclet");
    expect(__test__.prettyStationName("")).toBe("");
  });
});
