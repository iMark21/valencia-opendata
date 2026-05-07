import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import { registerGetEmtStopsTool } from "../src/tools/get_emt_stops.js";

async function callTool(args: Record<string, unknown>) {
  const arcgis = new ArcgisClient();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerGetEmtStopsTool(server, arcgis);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({
      name: "get_emt_stops",
      arguments: args,
    });
    return JSON.parse(
      (res.content as Array<{ text: string }>)[0]?.text ?? "{}",
    );
  } finally {
    await client.close();
  }
}

describe("get_emt_stops — integration (record/replay)", () => {
  it("near Plaça de l'Ajuntament returns stops sorted by distance", async () => {
    const out = (await callTool({
      near: { lat: 39.4699, lng: -0.3763, radius_m: 400 },
      limit: 5,
    })) as {
      stops: Array<{
        id: number;
        name: string;
        lines: string[];
        lat: number;
        lng: number;
        distance_m: number;
        arrivals_url: string;
      }>;
      source: { layer_id: number };
    };

    expect(out.stops.length).toBeGreaterThan(0);
    expect(out.source.layer_id).toBe(226);

    let prev = -1;
    for (const stop of out.stops) {
      expect(stop.lat).toBeGreaterThan(39.3);
      expect(stop.lat).toBeLessThan(39.6);
      expect(stop.lng).toBeGreaterThan(-0.5);
      expect(stop.lng).toBeLessThan(-0.3);
      expect(stop.lines.length).toBeGreaterThan(0);
      expect(stop.arrivals_url).toMatch(
        /emtvalencia\.es\/QR\.php\?sec=est&p=\d+/,
      );
      expect(stop.distance_m).toBeGreaterThanOrEqual(prev);
      prev = stop.distance_m;
    }
  });

  it("filtering by line returns only stops on that line", async () => {
    const out = (await callTool({ linea: "10", limit: 5 })) as {
      stops: Array<{ lines: string[] }>;
    };
    expect(out.stops.length).toBeGreaterThan(0);
    for (const s of out.stops) {
      expect(s.lines).toContain("10");
    }
  });
});
