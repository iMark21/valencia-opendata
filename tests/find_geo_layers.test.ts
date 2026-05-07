import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import {
  registerFindGeoLayersTool,
  normalize,
} from "../src/tools/find_geo_layers.js";

type Plan = {
  serviceListing?: { services: Array<{ name: string; type: string }> };
  serviceInfos?: Record<
    string,
    {
      layers: Array<{ id: number; name: string; geometryType?: string }>;
    }
  >;
  layerInfos?: Record<string, { fields?: Array<{ name: string }> }>;
};

function fakeFetch(plan: Plan): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const path = url.pathname;
    const after = path.split("/server/rest/services/")[1] ?? "";

    // /OPENDATA/  → service listing
    if (after === "OPENDATA/" || after === "OPENDATA") {
      return new Response(
        JSON.stringify(plan.serviceListing ?? { services: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // /OPENDATA/<svc>/MapServer/<n>  → layerInfo
    const layerMatch = /^(OPENDATA\/[^/]+)\/MapServer\/(\d+)$/.exec(after);
    if (layerMatch) {
      const key = `${layerMatch[1]}#${layerMatch[2]}`;
      const li = plan.layerInfos?.[key] ?? { fields: [] };
      return new Response(JSON.stringify(li), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // /OPENDATA/<svc>/MapServer  → serviceInfo
    const svcMatch = /^(OPENDATA\/[^/]+)\/MapServer$/.exec(after);
    if (svcMatch) {
      const svcName = svcMatch[1] ?? "";
      const info = plan.serviceInfos?.[svcName] ?? { layers: [] };
      return new Response(JSON.stringify(info), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

async function harness(plan: Plan) {
  const arcgis = new ArcgisClient({ fetchImpl: fakeFetch(plan) });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerFindGeoLayersTool(server, arcgis);
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

describe("find_geo_layers tool", () => {
  it("AC3: service set → returns all layers of that service", async () => {
    const { client, close } = await harness({
      serviceInfos: {
        "OPENDATA/Trafico": {
          layers: [
            { id: 0, name: "Tramos", geometryType: "esriGeometryPolyline" },
            { id: 228, name: "ValenBisi", geometryType: "esriGeometryPoint" },
          ],
        },
      },
      layerInfos: {
        "OPENDATA/Trafico#228": {
          fields: [{ name: "id" }, { name: "name" }, { name: "available" }],
        },
        "OPENDATA/Trafico#0": { fields: [{ name: "id" }] },
      },
    });
    try {
      const res = await client.callTool({
        name: "find_geo_layers",
        arguments: { service: "OPENDATA/Trafico" },
      });
      const out = parsePayload(res) as {
        layers: Array<{
          service: string;
          layer_id: number;
          name: string;
          geometry_type: string;
          fields_count: number;
        }>;
      };
      expect(out.layers).toHaveLength(2);
      const valenbisi = out.layers.find((l) => l.layer_id === 228);
      expect(valenbisi?.name).toBe("ValenBisi");
      expect(valenbisi?.geometry_type).toBe("esriGeometryPoint");
      expect(valenbisi?.fields_count).toBe(3);
    } finally {
      await close();
    }
  });

  it("AC4: query searches across OPENDATA services, accent-insensitive", async () => {
    const { client, close } = await harness({
      serviceListing: {
        services: [
          { name: "OPENDATA/MedioAmbiente", type: "MapServer" },
          { name: "OPENDATA/Trafico", type: "MapServer" },
        ],
      },
      serviceInfos: {
        "OPENDATA/MedioAmbiente": {
          layers: [
            { id: 1, name: "Calidad del aire", geometryType: "esriGeometryPoint" },
            { id: 2, name: "Niveles de ruido", geometryType: "esriGeometryPolygon" },
          ],
        },
        "OPENDATA/Trafico": {
          layers: [
            { id: 9, name: "Cámaras de tráfico", geometryType: "esriGeometryPoint" },
          ],
        },
      },
    });
    try {
      // Query without accent should match "Cámaras"
      const res = await client.callTool({
        name: "find_geo_layers",
        arguments: { query: "camaras" },
      });
      const out = parsePayload(res) as {
        layers: Array<{ name: string; service: string }>;
      };
      expect(out.layers).toHaveLength(1);
      expect(out.layers[0]?.name).toBe("Cámaras de tráfico");
      expect(out.layers[0]?.service).toBe("OPENDATA/Trafico");
    } finally {
      await close();
    }
  });

  it("AC5: no args → catalog of services with layer counts", async () => {
    const { client, close } = await harness({
      serviceListing: {
        services: [
          { name: "OPENDATA/MedioAmbiente", type: "MapServer" },
          { name: "OPENDATA/Trafico", type: "MapServer" },
        ],
      },
      serviceInfos: {
        "OPENDATA/MedioAmbiente": {
          layers: [
            { id: 1, name: "a" },
            { id: 2, name: "b" },
          ],
        },
        "OPENDATA/Trafico": {
          layers: [{ id: 1, name: "x" }],
        },
      },
    });
    try {
      const res = await client.callTool({
        name: "find_geo_layers",
        arguments: {},
      });
      const out = parsePayload(res) as {
        services: Array<{ service: string; layers_count: number }>;
      };
      expect(out.services).toHaveLength(2);
      const ma = out.services.find(
        (s) => s.service === "OPENDATA/MedioAmbiente",
      );
      expect(ma?.layers_count).toBe(2);
      const tr = out.services.find((s) => s.service === "OPENDATA/Trafico");
      expect(tr?.layers_count).toBe(1);
    } finally {
      await close();
    }
  });

  it("rejects service+query as mutually exclusive", async () => {
    const { client, close } = await harness({});
    try {
      const res = await client.callTool({
        name: "find_geo_layers",
        arguments: { service: "OPENDATA/Trafico", query: "x" },
      });
      const out = parsePayload(res) as { error?: { code: string } };
      expect(out.error?.code).toBe("invalid_input");
    } finally {
      await close();
    }
  });
});

describe("normalize", () => {
  it("strips accents and lowercases", () => {
    expect(normalize("Cámaras")).toBe("camaras");
    expect(normalize("Niveles de Ruído")).toBe("niveles de ruido");
    expect(normalize("Russafa")).toBe("russafa");
  });
});
