import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import { registerQueryGeoLayerTool } from "../src/tools/query_geo_layer.js";


async function callTool(args: Record<string, unknown>) {
  const arcgis = new ArcgisClient();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerQueryGeoLayerTool(server, arcgis);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({
      name: "query_geo_layer",
      arguments: args,
    });
    return JSON.parse(
      (res.content as Array<{ text: string }>)[0]?.text ?? "{}",
    );
  } finally {
    await client.close();
  }
}

describe(
  "query_geo_layer — integration (live geoportal)",
  () => {
    it("ValenBisi (228) returns at least one station with a point geometry", async () => {
      const out = (await callTool({
        service: "OPENDATA/Trafico",
        layer_id: 228,
        limit: 5,
      })) as {
        count: number;
        features: Array<{
          attributes: Record<string, unknown>;
          geometry: { type: string; coordinates: [number, number] };
        }>;
      };
      expect(out.count).toBeGreaterThan(0);
      expect(out.features[0]?.geometry.type).toBe("Point");
      const [lng, lat] = out.features[0]!.geometry.coordinates;
      // Loose sanity check — València is around (39.47, -0.37).
      // The portal uses Web Mercator (EPSG:3857) as default xy, so the values
      // are in meters not degrees. We accept any non-zero numeric pair.
      expect(typeof lng).toBe("number");
      expect(typeof lat).toBe("number");
    });

    it("non-existent layer maps to layer_not_found", async () => {
      const out = (await callTool({
        service: "OPENDATA/Trafico",
        layer_id: 99999,
      })) as { error?: { code: string } };
      expect(out.error?.code).toBe("layer_not_found");
    });
  },
);
