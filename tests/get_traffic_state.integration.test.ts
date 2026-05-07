import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import { registerGetTrafficStateTool } from "../src/tools/get_traffic_state.js";

const integration = process.env.INTEGRATION === "1";

async function callTool(args: Record<string, unknown>) {
  const arcgis = new ArcgisClient();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerGetTrafficStateTool(server, arcgis);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({
      name: "get_traffic_state",
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
  "get_traffic_state — integration (live geoportal)",
  () => {
    it("scope=cameras near centre returns cameras with viewer URLs", async () => {
      const out = (await callTool({
        scope: "cameras",
        near: { lat: 39.4699, lng: -0.3763, radius_m: 1500 },
        limit: 5,
      })) as {
        cameras: Array<{ id: string; url: string; lat: number; lng: number }>;
      };
      expect(out.cameras.length).toBeGreaterThan(0);
      for (const c of out.cameras) {
        expect(c.url).toMatch(/camaras\.valencia\.es/);
        expect(c.lat).toBeGreaterThan(39.4);
        expect(c.lng).toBeLessThan(-0.3);
      }
    });

    it("scope=tramos returns at least one segment with status label", async () => {
      const out = (await callTool({ scope: "tramos", limit: 5 })) as {
        tramos: Array<{ name: string; status: string; status_code: number }>;
      };
      expect(out.tramos.length).toBeGreaterThan(0);
      const validStatuses = ["fluido", "denso", "congestionado", "cortado", "unknown"];
      for (const t of out.tramos) {
        expect(validStatuses).toContain(t.status);
      }
    });
  },
);
