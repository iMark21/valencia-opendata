import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CkanClient } from "../src/clients/ckan.js";
import { registerListDatasetsTool } from "../src/tools/list_datasets.js";

const integration = process.env.INTEGRATION === "1";

describe.skipIf(!integration)("list_datasets — integration (live portal)", () => {
  it("default invocation returns 20 datasets and total≈294", async () => {
    const ckan = new CkanClient();
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerListDatasetsTool(server, ckan);
    const [s, c] = InMemoryTransport.createLinkedPair();
    const client = new Client(
      { name: "t", version: "0.0.0" },
      { capabilities: {} },
    );
    await Promise.all([server.connect(s), client.connect(c)]);

    try {
      const res = await client.callTool({
        name: "list_datasets",
        arguments: {},
      });
      const out = JSON.parse(
        (res.content as Array<{ text: string }>)[0]?.text ?? "{}",
      ) as { total: number; count: number; results: Array<{ id: string }> };
      expect(out.total).toBeGreaterThan(250);
      expect(out.count).toBe(20);
      expect(out.results[0]?.id).toBeDefined();
    } finally {
      await client.close();
    }
  });

  it("filtering by theme transporte returns only transport datasets", async () => {
    const ckan = new CkanClient();
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerListDatasetsTool(server, ckan);
    const [s, c] = InMemoryTransport.createLinkedPair();
    const client = new Client(
      { name: "t", version: "0.0.0" },
      { capabilities: {} },
    );
    await Promise.all([server.connect(s), client.connect(c)]);

    try {
      const res = await client.callTool({
        name: "list_datasets",
        arguments: { theme: "transporte", limit: 5 },
      });
      const out = JSON.parse(
        (res.content as Array<{ text: string }>)[0]?.text ?? "{}",
      ) as {
        count: number;
        results: Array<{ theme: string[] }>;
      };
      expect(out.count).toBeGreaterThan(0);
      for (const r of out.results) {
        expect(r.theme).toContain("transporte");
      }
    } finally {
      await client.close();
    }
  });
});
