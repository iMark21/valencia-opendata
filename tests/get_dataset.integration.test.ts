import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CkanClient } from "../src/clients/ckan.js";
import { registerGetDatasetTool } from "../src/tools/get_dataset.js";


async function callTool(id: string) {
  const ckan = new CkanClient();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerGetDatasetTool(server, ckan);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({
      name: "get_dataset",
      arguments: { id },
    });
    return JSON.parse(
      (res.content as Array<{ text: string }>)[0]?.text ?? "{}",
    );
  } finally {
    await client.close();
  }
}

describe("get_dataset — integration (live portal)", () => {
  it("ValenBisi → returns metadata + related_layers pointing to Trafico/228", async () => {
    const out = (await callTool(
      "valenbisi-disponibilitat-valenbisi-dsiponibilidad",
    )) as {
      id: string;
      title: string;
      theme: string[];
      license: string;
      resources: Array<{ format: string; url: string }>;
      related_layers?: Array<{ service: string; layer_id: number }>;
    };

    expect(out.id).toBeDefined();
    expect(out.title).toMatch(/ValenBisi/i);
    expect(out.theme).toContain("transporte");
    expect(out.license).toMatch(/CC BY 4\.0/);
    expect(out.resources.length).toBeGreaterThan(0);
    expect(out.related_layers).toBeDefined();
    expect(out.related_layers).toContainEqual({
      service: "OPENDATA/Trafico",
      layer_id: 228,
    });
  });

  it("not found returns code='not_found' + 3 suggestions", async () => {
    const out = (await callTool("definitely-not-a-real-dataset-9999")) as {
      error?: { code: string; suggestions: string[] };
    };
    expect(out.error?.code).toBe("not_found");
    expect(out.error?.suggestions).toHaveLength(3);
  });
});
