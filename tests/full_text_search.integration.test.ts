import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CkanClient } from "../src/clients/ckan.js";
import { registerFullTextSearchTool } from "../src/tools/full_text_search.js";

const integration = process.env.INTEGRATION === "1";

async function callTool(args: Record<string, unknown>) {
  const ckan = new CkanClient();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerFullTextSearchTool(server, ckan);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({
      name: "full_text_search",
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
  "full_text_search — integration (live portal)",
  () => {
    it("'calidad aire' returns air-quality datasets", async () => {
      const out = (await callTool({ query: "calidad aire", rows: 5 })) as {
        total: number;
        results: Array<{ id: string; title: string }>;
      };
      expect(out.total).toBeGreaterThan(0);
      expect(out.results.length).toBeGreaterThan(0);
      // The exact top dataset varies — assert that at least one result
      // mentions air quality in title.
      const matchesAirQuality = out.results.some((r) =>
        /aire|air[- ]quality|qualitat/i.test(r.title),
      );
      expect(matchesAirQuality).toBe(true);
    });

    it("'valenbisi' query returns the bike-sharing datasets", async () => {
      const out = (await callTool({ query: "valenbisi", rows: 3 })) as {
        total: number;
        results: Array<{ id: string; title: string }>;
      };
      expect(out.total).toBeGreaterThan(0);
      const titlesLower = out.results
        .map((r) => r.title.toLowerCase())
        .join(" ");
      expect(titlesLower).toContain("valenbisi");
    });
  },
);
