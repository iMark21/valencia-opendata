import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CkanClient } from "../src/clients/ckan.js";
import { registerGetDatasetResourceTool } from "../src/tools/get_dataset_resource.js";
import { registerGetDatasetTool } from "../src/tools/get_dataset.js";

const integration = process.env.INTEGRATION === "1";

async function getValenBisiResourceId(): Promise<string> {
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
      arguments: { id: "valenbisi-disponibilitat-valenbisi-dsiponibilidad" },
    });
    const out = JSON.parse(
      (res.content as Array<{ text: string }>)[0]?.text ?? "{}",
    ) as { resources: Array<{ id: string; format: string }> };
    const json = out.resources.find((r) => r.format.toUpperCase() === "JSON");
    return (json ?? out.resources[0])!.id;
  } finally {
    await client.close();
  }
}

describe.skipIf(!integration)(
  "get_dataset_resource — integration (live portal)",
  () => {
    it("ValenBisi JSON resource → returns Geoportal hint, no schema by default", async () => {
      const resourceId = await getValenBisiResourceId();

      const ckan = new CkanClient();
      const server = new McpServer({ name: "test", version: "0.0.0" });
      registerGetDatasetResourceTool(server, { ckan });
      const [s, c] = InMemoryTransport.createLinkedPair();
      const client = new Client(
        { name: "t", version: "0.0.0" },
        { capabilities: {} },
      );
      await Promise.all([server.connect(s), client.connect(c)]);
      try {
        const res = await client.callTool({
          name: "get_dataset_resource",
          arguments: { resource_id: resourceId },
        });
        const out = JSON.parse(
          (res.content as Array<{ text: string }>)[0]?.text ?? "{}",
        ) as {
          url: string;
          format: string;
          notes_for_llm: string;
          schema?: unknown;
        };
        expect(out.url).toMatch(/geoportal\.valencia\.es/);
        expect(out.notes_for_llm).toMatch(/query_geo_layer/);
        expect(out.schema).toBeUndefined();
      } finally {
        await client.close();
      }
    });
  },
);
