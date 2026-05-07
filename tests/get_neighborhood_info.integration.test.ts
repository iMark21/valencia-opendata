import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import { registerGetNeighborhoodInfoTool } from "../src/tools/get_neighborhood_info.js";


async function callTool(args: Record<string, unknown>) {
  const arcgis = new ArcgisClient();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerGetNeighborhoodInfoTool(server, { arcgis });
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({
      name: "get_neighborhood_info",
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
  "get_neighborhood_info — integration (live geoportal)",
  () => {
    it("list_all returns ~88 València neighborhoods with district names", async () => {
      const out = (await callTool({ list_all: true })) as {
        count: number;
        barris: Array<{ name: string; district_name: string | null }>;
      };
      expect(out.count).toBeGreaterThan(50);
      // Most barris should resolve a district name from layer 225.
      const withDistrict = out.barris.filter((b) => b.district_name !== null);
      expect(withDistrict.length).toBeGreaterThan(out.count * 0.5);
    });

    it("at: city-centre coords resolve to a real neighborhood", async () => {
      const out = (await callTool({
        at: { lat: 39.4699, lng: -0.3763 },
      })) as { name: string; centroid: { lat: number; lng: number } };
      expect(out.name).toBeDefined();
      expect(out.name.length).toBeGreaterThan(0);
      // Centroid inside València box
      expect(out.centroid.lat).toBeGreaterThan(39.4);
      expect(out.centroid.lat).toBeLessThan(39.6);
    });
  },
);
