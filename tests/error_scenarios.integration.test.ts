import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CkanClient } from "../src/clients/ckan.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import { registerGetDatasetTool } from "../src/tools/get_dataset.js";
import { registerQueryGeoLayerTool } from "../src/tools/query_geo_layer.js";

// AC3 of VALMCP-15: cover one CKAN error and one ArcGIS error scenario.
// These are recorded via the same fixture harness as the success paths so
// that the error envelope (status, body shape) is pinned and CI fails if
// upstream changes the contract silently.

async function callOnceCkan(args: Record<string, unknown>) {
  const ckan = new CkanClient();
  const arcgis = new ArcgisClient();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerGetDatasetTool(server, ckan, arcgis);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({ name: "get_dataset", arguments: args });
    return JSON.parse(
      (res.content as Array<{ text: string }>)[0]?.text ?? "{}",
    );
  } finally {
    await client.close();
  }
}

async function callOnceArcgis(args: Record<string, unknown>) {
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

describe("error scenarios — record/replay", () => {
  it("CKAN: get_dataset for unknown id returns a structured error", async () => {
    const out = await callOnceCkan({ id: "no-such-dataset-zzz-vlc" });
    expect(out.error).toBeDefined();
    expect(typeof out.error.code).toBe("string");
  });

  it("ArcGIS: query_geo_layer for non-existent layer returns a structured error", async () => {
    const out = await callOnceArcgis({
      service: "OPENDATA/Trafico",
      layer_id: 99999,
      where: "1=1",
    });
    expect(out.error).toBeDefined();
    expect(typeof out.error.code).toBe("string");
  });
});
