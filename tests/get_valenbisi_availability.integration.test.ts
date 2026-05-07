import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import { registerGetValenbisiTool } from "../src/tools/get_valenbisi_availability.js";


async function callTool(args: Record<string, unknown>) {
  const arcgis = new ArcgisClient();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerGetValenbisiTool(server, arcgis);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({
      name: "get_valenbisi_availability",
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
  "get_valenbisi_availability — integration (live geoportal)",
  () => {
    it("near city centre returns at least one open station with bikes", async () => {
      const out = (await callTool({
        near: { lat: 39.4699, lng: -0.3763, radius_m: 1000 },
      })) as {
        stations: Array<{
          id: number;
          name: string;
          bikes_available: number;
          status: string;
          distance_m: number;
        }>;
      };
      expect(out.stations.length).toBeGreaterThan(0);
      for (const s of out.stations) {
        expect(s.status).toBe("open");
        expect(s.bikes_available).toBeGreaterThan(0);
        expect(s.distance_m).toBeLessThanOrEqual(1000);
      }
    });
  },
);
