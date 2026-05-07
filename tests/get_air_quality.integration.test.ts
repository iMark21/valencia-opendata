import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import { registerGetAirQualityTool } from "../src/tools/get_air_quality.js";

const integration = process.env.INTEGRATION === "1";

async function callTool(args: Record<string, unknown>) {
  const arcgis = new ArcgisClient();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerGetAirQualityTool(server, arcgis);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({
      name: "get_air_quality",
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
  "get_air_quality — integration (live geoportal)",
  () => {
    it("returns at least 7 València stations with WGS84 coords near (39.47, -0.37)", async () => {
      const out = (await callTool({})) as {
        stations: Array<{
          name: string;
          lat: number;
          lng: number;
          readings: Array<{ pollutant: string; value: number }>;
        }>;
        history_pointer: { dataset_id: string };
      };
      expect(out.stations.length).toBeGreaterThanOrEqual(7);
      for (const st of out.stations) {
        expect(st.lat).toBeGreaterThan(39.3);
        expect(st.lat).toBeLessThan(39.6);
        expect(st.lng).toBeGreaterThan(-0.5);
        expect(st.lng).toBeLessThan(-0.3);
      }
      expect(out.history_pointer.dataset_id).toBe(
        "hourly-air-quality-data-since-2016",
      );
    });

    it("station=universidad picks the Universidad Politécnica station", async () => {
      const out = (await callTool({ station: "universidad" })) as {
        stations: Array<{ name: string }>;
      };
      expect(out.stations.length).toBeGreaterThan(0);
      const found = out.stations.some((s) =>
        /universidad|politec/i.test(s.name),
      );
      expect(found).toBe(true);
    });
  },
);
