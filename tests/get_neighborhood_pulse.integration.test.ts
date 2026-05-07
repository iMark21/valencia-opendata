import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import { registerGetNeighborhoodPulseTool } from "../src/tools/get_neighborhood_pulse.js";

async function callTool(args: Record<string, unknown>) {
  const arcgis = new ArcgisClient();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerGetNeighborhoodPulseTool(server, arcgis);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({
      name: "get_neighborhood_pulse",
      arguments: args,
    });
    return JSON.parse(
      (res.content as Array<{ text: string }>)[0]?.text ?? "{}",
    );
  } finally {
    await client.close();
  }
}

describe("get_neighborhood_pulse — integration (record/replay)", () => {
  it("computes a pulse for Russafa with required envelope", async () => {
    const out = (await callTool({ barri: "russafa" })) as {
      barri: string;
      pulse_score: number | null;
      components: {
        air: { source: { layer_id?: number } };
        noise: { unit: string };
        green: { unit: string };
        vulnerability: { source: { dataset_id?: string } };
      };
      weights_used: { air: number; noise: number; green: number; vulnerability: number };
      caveat: string;
    };
    expect(out.barri).toMatch(/russafa/i);
    expect(out.weights_used).toEqual({
      air: 0.4,
      noise: 0.25,
      green: 0.2,
      vulnerability: 0.15,
    });
    expect(out.caveat).toMatch(/opinables|pesos/i);
    expect(out.components.air.source.layer_id).toBe(156);
    expect(out.components.vulnerability.source.dataset_id).toBe(
      "vulnerabilidad-por-barrios",
    );
  });

  it("compare_with returns symmetric envelope", async () => {
    const out = (await callTool({
      barri: "russafa",
      compare_with: "el-carme",
    })) as {
      comparison: {
        a: { barri: string };
        b: { barri: string };
        deltas: { pulse_score: number | null };
      };
    };
    expect(out.comparison.a.barri).toMatch(/russafa/i);
    expect(out.comparison.b.barri).toMatch(/carme/i);
  });
});
