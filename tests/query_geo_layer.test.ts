import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import {
  registerQueryGeoLayerTool,
  __test__,
} from "../src/tools/query_geo_layer.js";

function fakeFetch(
  responder: (url: URL) => { status?: number; body: string },
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const { status = 200, body } = responder(url);
    return new Response(body, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

async function harness(fetchImpl: typeof fetch) {
  const arcgis = new ArcgisClient({ fetchImpl });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerQueryGeoLayerTool(server, arcgis);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  return { client, fetchImpl, close: () => client.close() };
}

function parsePayload(res: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const c = (res.content as Array<{ type: string; text: string }>)?.[0];
  return JSON.parse(c?.text ?? "{}");
}

describe("query_geo_layer tool", () => {
  it("AC1+AC2: minimal call returns features + count + exceeded flag", async () => {
    const fetchImpl = fakeFetch((u) => {
      expect(u.pathname).toContain("OPENDATA/Trafico/MapServer/228/query");
      expect(u.searchParams.get("where")).toBe("1=1");
      expect(u.searchParams.get("outFields")).toBe("*");
      expect(u.searchParams.get("returnGeometry")).toBe("true");
      expect(u.searchParams.get("resultRecordCount")).toBe("50");
      return {
        body: JSON.stringify({
          features: [
            {
              attributes: { id: 1, name: "Plaza Reina" },
              geometry: { x: -0.375, y: 39.475 },
            },
          ],
          exceededTransferLimit: false,
        }),
      };
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "query_geo_layer",
        arguments: { service: "OPENDATA/Trafico", layer_id: 228 },
      });
      const out = parsePayload(res) as {
        service: string;
        layer_id: number;
        count: number;
        exceeded_transfer_limit: boolean;
        features: Array<{
          attributes: Record<string, unknown>;
          geometry: { type: string };
        }>;
        source: { endpoint: string };
      };
      expect(out.service).toBe("OPENDATA/Trafico");
      expect(out.layer_id).toBe(228);
      expect(out.count).toBe(1);
      expect(out.exceeded_transfer_limit).toBe(false);
      expect(out.features[0]?.geometry.type).toBe("Point");
      expect(out.source.endpoint).toContain("OPENDATA/Trafico/MapServer/228");
    } finally {
      await close();
    }
  });

  it("AC3: near {lat,lng,radius_m} → envelope geometry around the point", async () => {
    const fetchImpl = fakeFetch((u) => {
      const geom = u.searchParams.get("geometry");
      expect(geom).toBeTruthy();
      const env = JSON.parse(geom!) as {
        xmin: number;
        ymin: number;
        xmax: number;
        ymax: number;
        spatialReference: { wkid: number };
      };
      expect(env.spatialReference.wkid).toBe(4326);
      // ~500m around (39.47, -0.37) ≈ ~0.0045 deg lat, ~0.0058 deg lng
      expect(env.ymax - env.ymin).toBeCloseTo(0.009, 2);
      expect(u.searchParams.get("geometryType")).toBe("esriGeometryEnvelope");
      expect(u.searchParams.get("spatialRel")).toBe("esriSpatialRelIntersects");
      return {
        body: JSON.stringify({ features: [], exceededTransferLimit: false }),
      };
    });
    const { client, close } = await harness(fetchImpl);
    try {
      await client.callTool({
        name: "query_geo_layer",
        arguments: {
          service: "OPENDATA/Trafico",
          layer_id: 228,
          near: { lat: 39.47, lng: -0.37, radius_m: 500 },
        },
      });
    } finally {
      await close();
    }
  });

  it("AC1: bbox + near rejected as mutually exclusive", async () => {
    const fetchImpl = fakeFetch(() => ({
      body: JSON.stringify({ features: [] }),
    }));
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "query_geo_layer",
        arguments: {
          service: "OPENDATA/Trafico",
          layer_id: 228,
          near: { lat: 39, lng: -0.3, radius_m: 200 },
          bbox: { minLat: 39, minLng: -0.4, maxLat: 39.5, maxLng: -0.3 },
        },
      });
      const out = parsePayload(res) as { error?: { code: string } };
      expect(out.error?.code).toBe("invalid_input");
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("AC4: layer not found maps to layer_not_found with suggestion", async () => {
    const fetchImpl = fakeFetch(() => ({
      body: JSON.stringify({
        error: { code: 400, message: "Invalid or missing layer" },
      }),
    }));
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "query_geo_layer",
        arguments: { service: "OPENDATA/Trafico", layer_id: 9999 },
      });
      const out = parsePayload(res) as {
        error?: { code: string; suggestion: string };
      };
      expect(out.error?.code).toBe("layer_not_found");
      expect(out.error?.suggestion).toMatch(/find_geo_layers/);
    } finally {
      await close();
    }
  });

  it("AC4: HTTP 404 also maps to layer_not_found", async () => {
    const fetchImpl = fakeFetch(() => ({
      status: 404,
      body: "Not Found",
    }));
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "query_geo_layer",
        arguments: { service: "OPENDATA/Missing", layer_id: 99 },
      });
      const out = parsePayload(res) as { error?: { code: string } };
      expect(out.error?.code).toBe("layer_not_found");
    } finally {
      await close();
    }
  });

  it("AC6: exceededTransferLimit propagates to caller", async () => {
    const fetchImpl = fakeFetch(() => ({
      body: JSON.stringify({
        features: Array.from({ length: 500 }).map((_, i) => ({
          attributes: { id: i },
          geometry: { x: 0, y: 0 },
        })),
        exceededTransferLimit: true,
      }),
    }));
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "query_geo_layer",
        arguments: { service: "OPENDATA/Trafico", layer_id: 228, limit: 500 },
      });
      const out = parsePayload(res) as {
        count: number;
        exceeded_transfer_limit: boolean;
      };
      expect(out.count).toBe(500);
      expect(out.exceeded_transfer_limit).toBe(true);
    } finally {
      await close();
    }
  });

  it("input validation: limit > 500 is rejected", async () => {
    const fetchImpl = fakeFetch(() => ({
      body: JSON.stringify({ features: [] }),
    }));
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "query_geo_layer",
        arguments: { service: "OPENDATA/Trafico", layer_id: 228, limit: 1000 },
      });
      expect(res.isError).toBe(true);
    } finally {
      await close();
    }
  });
});

describe("envelope helpers", () => {
  it("envelopeFromBbox preserves bounds and sets WGS84", () => {
    const env = __test__.envelopeFromBbox({
      minLat: 39,
      minLng: -0.5,
      maxLat: 39.5,
      maxLng: -0.3,
    });
    expect(env).toEqual({
      xmin: -0.5,
      ymin: 39,
      xmax: -0.3,
      ymax: 39.5,
      spatialReference: { wkid: 4326 },
    });
  });

  it("envelopeFromNear scales radius into degrees and accounts for latitude", () => {
    const env = __test__.envelopeFromNear({
      lat: 39.47,
      lng: -0.37,
      radius_m: 1000,
    });
    // ~9e-3 deg lat, ~12e-3 deg lng at lat 39.47
    expect(env.ymax - env.ymin).toBeCloseTo(0.018, 2);
    expect(env.xmax - env.xmin).toBeGreaterThan(env.ymax - env.ymin);
  });
});
