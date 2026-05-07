import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import {
  registerGetAirQualityTool,
  __test__,
} from "../src/tools/get_air_quality.js";

type StationStub = {
  nombre: string;
  fiwareid: string;
  direccion?: string;
  tipozona?: string;
  tipoemisio?: string;
  calidad_am?: string;
  no2?: number;
  pm10?: number;
  pm25?: number;
  o3?: number;
  so2?: number;
  co?: number;
  fecha_carg?: number;
  // UTM30N coordinates (EPSG:25830)
  x: number;
  y: number;
};

function fakeArcgisFetch(stations: StationStub[]): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    if (!url.pathname.includes("/MapServer/156/query")) {
      return new Response("not found", { status: 404 });
    }
    return new Response(
      JSON.stringify({
        features: stations.map((s) => ({
          attributes: {
            nombre: s.nombre,
            fiwareid: s.fiwareid,
            direccion: s.direccion ?? null,
            tipozona: s.tipozona ?? null,
            tipoemisio: s.tipoemisio ?? null,
            calidad_am: s.calidad_am ?? null,
            no2: s.no2 ?? null,
            pm10: s.pm10 ?? null,
            pm25: s.pm25 ?? null,
            o3: s.o3 ?? null,
            so2: s.so2 ?? null,
            co: s.co ?? null,
            fecha_carg: s.fecha_carg ?? null,
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

async function harness(stations: StationStub[]) {
  const arcgis = new ArcgisClient({ fetchImpl: fakeArcgisFetch(stations) });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerGetAirQualityTool(server, arcgis);
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

const TS_EPOCH = 1_777_900_000_000; // arbitrary fixed epoch

const SAMPLES: StationStub[] = [
  {
    nombre: "Centro",
    fiwareid: "A07_VALENCIACENTRE_60m",
    direccion: "C/ del Centre",
    tipozona: "Urbana",
    tipoemisio: "Tráfico",
    calidad_am: "Razonablemente Buena",
    no2: 18.5,
    pm10: 22.0,
    pm25: 7.5,
    o3: 50,
    fecha_carg: TS_EPOCH,
    x: 725580, // UTM30N approx city centre
    y: 4373900,
  },
  {
    nombre: "Francia",
    fiwareid: "A01_AVFRANCIA_60m",
    no2: 21,
    pm10: 25,
    fecha_carg: TS_EPOCH,
    x: 728400,
    y: 4372100,
  },
];

describe("get_air_quality tool", () => {
  it("AC2: 'all' returns every station with WGS84 lat/lng + ISO measured_at", async () => {
    const { client, close } = await harness(SAMPLES);
    try {
      const res = await client.callTool({
        name: "get_air_quality",
        arguments: {},
      });
      const out = parsePayload(res) as {
        stations: Array<{
          name: string;
          lat: number;
          lng: number;
          measured_at: string;
          readings: Array<{ pollutant: string; value: number }>;
        }>;
        history_pointer: { dataset_id: string; size_bytes: number };
      };
      expect(out.stations).toHaveLength(2);
      const centre = out.stations.find((s) => s.name === "Centro")!;
      // València centre is around (39.47, -0.376)
      expect(centre.lat).toBeGreaterThan(39.4);
      expect(centre.lat).toBeLessThan(39.5);
      expect(centre.lng).toBeGreaterThan(-0.42);
      expect(centre.lng).toBeLessThan(-0.32);
      expect(centre.measured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(centre.readings.length).toBeGreaterThan(0);
      expect(out.history_pointer.dataset_id).toBe(
        "hourly-air-quality-data-since-2016",
      );
    } finally {
      await close();
    }
  });

  it("AC1: pollutant filter returns only that one reading per station", async () => {
    const { client, close } = await harness(SAMPLES);
    try {
      const res = await client.callTool({
        name: "get_air_quality",
        arguments: { pollutant: "no2" },
      });
      const out = parsePayload(res) as {
        stations: Array<{ readings: Array<{ pollutant: string }> }>;
      };
      for (const s of out.stations) {
        expect(s.readings).toHaveLength(1);
        expect(s.readings[0]?.pollutant).toBe("no2");
      }
    } finally {
      await close();
    }
  });

  it("AC5: near returns only the closest station with distance_m", async () => {
    const { client, close } = await harness(SAMPLES);
    try {
      // Close to Francia (around 39.46, -0.34)
      const res = await client.callTool({
        name: "get_air_quality",
        arguments: { near: { lat: 39.46, lng: -0.34 } },
      });
      const out = parsePayload(res) as {
        stations: Array<{ name: string; distance_m: number }>;
      };
      expect(out.stations).toHaveLength(1);
      expect(out.stations[0]?.name).toBe("Francia");
      expect(out.stations[0]?.distance_m).toBeGreaterThanOrEqual(0);
      expect(out.stations[0]?.distance_m).toBeLessThan(5_000);
    } finally {
      await close();
    }
  });

  it("AC6: unknown station returns valid_stations in suggestions", async () => {
    const { client, close } = await harness(SAMPLES);
    try {
      const res = await client.callTool({
        name: "get_air_quality",
        arguments: { station: "atlantida" },
      });
      const out = parsePayload(res) as {
        error?: {
          code: string;
          suggestions: { valid_stations: Array<{ name: string }> };
        };
      };
      expect(out.error?.code).toBe("unknown_station");
      const names = out.error?.suggestions.valid_stations.map((s) => s.name) ?? [];
      expect(names).toContain("Centro");
      expect(names).toContain("Francia");
    } finally {
      await close();
    }
  });

  it("AC1: station match is accent + case insensitive", async () => {
    const samples = [
      { ...SAMPLES[0]!, nombre: "Molí del Sol" },
      SAMPLES[1]!,
    ];
    const { client, close } = await harness(samples);
    try {
      const res = await client.callTool({
        name: "get_air_quality",
        arguments: { station: "moli del sol" },
      });
      const out = parsePayload(res) as {
        stations: Array<{ name: string }>;
      };
      expect(out.stations).toHaveLength(1);
      expect(out.stations[0]?.name).toBe("Molí del Sol");
    } finally {
      await close();
    }
  });

  it("AC4: include_history_pointer=false omits the pointer entirely", async () => {
    const { client, close } = await harness(SAMPLES);
    try {
      const res = await client.callTool({
        name: "get_air_quality",
        arguments: { include_history_pointer: false },
      });
      const out = parsePayload(res) as { history_pointer?: unknown };
      expect(out.history_pointer).toBeUndefined();
    } finally {
      await close();
    }
  });

  it("invariant: response NEVER contains records/data/history_csv content", async () => {
    const { client, close } = await harness(SAMPLES);
    try {
      const res = await client.callTool({
        name: "get_air_quality",
        arguments: {},
      });
      const out = parsePayload(res) as Record<string, unknown>;
      expect(out.records).toBeUndefined();
      expect(out.data).toBeUndefined();
      expect(out.history_csv).toBeUndefined();
      expect(out.content).toBeUndefined();
      // history_pointer carries metadata only
      const ptr = out.history_pointer as Record<string, unknown> | undefined;
      expect(ptr?.records).toBeUndefined();
      expect(ptr?.content).toBeUndefined();
      expect(ptr?.rows).toBeUndefined();
    } finally {
      await close();
    }
  });
});

describe("UTM30N → WGS84 helper", () => {
  it("converts València centre coordinates to expected lat/lng", () => {
    // Plaza Reina ≈ 725900, 4373900 (UTM30N) → (39.475, -0.375)
    const [lng, lat] = __test__.utm30NToWgs84(725900, 4373900);
    expect(lat).toBeCloseTo(39.475, 1);
    expect(lng).toBeCloseTo(-0.375, 1);
  });

  it("haversine distance between two close points is reasonable", () => {
    // Centre to Russafa ≈ 1.5 km
    const d = __test__.haversine(39.475, -0.375, 39.461, -0.376);
    expect(d).toBeGreaterThan(1_000);
    expect(d).toBeLessThan(2_500);
  });

  it("history pointer references the correct dataset and is metadata-only", () => {
    const p = __test__.historyPointer();
    expect(p.dataset_id).toBe("hourly-air-quality-data-since-2016");
    expect(p.size_bytes).toBe(47_877_130);
    expect((p as Record<string, unknown>).records).toBeUndefined();
  });
});
