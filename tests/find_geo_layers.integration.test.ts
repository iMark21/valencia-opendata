import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import { registerFindGeoLayersTool } from "../src/tools/find_geo_layers.js";

const integration = process.env.INTEGRATION === "1";

async function callTool(args: Record<string, unknown>) {
  const arcgis = new ArcgisClient();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerFindGeoLayersTool(server, arcgis);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({
      name: "find_geo_layers",
      arguments: args,
    });
    return JSON.parse(
      (res.content as Array<{ text: string }>)[0]?.text ?? "{}",
    );
  } finally {
    await client.close();
  }
}

describe.skipIf(!integration)(
  "find_geo_layers — integration (live geoportal)",
  () => {
    it("no args → 6 OPENDATA services with layer counts", async () => {
      const out = (await callTool({})) as {
        services: Array<{ service: string; layers_count: number | null }>;
      };
      const names = out.services.map((s) => s.service).sort();
      expect(names).toContain("OPENDATA/Trafico");
      expect(names).toContain("OPENDATA/MedioAmbiente");
      expect(names).toContain("OPENDATA/Turismo");
      expect(names.length).toBeGreaterThanOrEqual(6);
      const trafico = out.services.find(
        (s) => s.service === "OPENDATA/Trafico",
      );
      expect(trafico?.layers_count).toBeGreaterThan(0);
    });

    it("service=OPENDATA/Trafico → real layers including 228", async () => {
      const out = (await callTool({ service: "OPENDATA/Trafico" })) as {
        layers: Array<{ layer_id: number; name: string }>;
      };
      expect(out.layers.length).toBeGreaterThan(0);
      // The 228 layer is well-known (ValenBisi). Don't assume the name —
      // schemas drift — but assert presence.
      expect(out.layers.some((l) => l.layer_id === 228)).toBe(true);
    });
  },
);
