import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CkanClient } from "../src/clients/ckan.js";
import { registerFullTextSearchTool } from "../src/tools/full_text_search.js";
import type { CkanPackage } from "../src/types/ckan.js";

function pkg(over: Partial<CkanPackage> & { score?: number }): CkanPackage {
  return {
    id: over.id ?? "id",
    name: over.name ?? "slug",
    title: over.title ?? "Title",
    notes: over.notes ?? "",
    organization: null,
    groups: over.groups ?? [],
    tags: [],
    resources: over.resources ?? [],
    metadata_modified: "2026-05-01T00:00:00",
    ...over,
  };
}

function fakeFetch(handler: {
  packageSearch: (
    q: string,
    params: URLSearchParams,
  ) => { count: number; results: CkanPackage[] };
}): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const action = url.pathname.split("/").pop();
    if (action === "package_search") {
      const q = url.searchParams.get("q") ?? "";
      return new Response(
        JSON.stringify({
          success: true,
          result: handler.packageSearch(q, url.searchParams),
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({ success: false, error: "unsupported" }),
      { status: 404 },
    );
  }) as unknown as typeof fetch;
}

async function harness(fetchImpl: typeof fetch) {
  const ckan = new CkanClient({ fetchImpl });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerFullTextSearchTool(server, ckan);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  return { client, fetchImpl, close: () => client.close() };
}

function parsePayload(res: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const c = (res.content as Array<{ type: string; text: string }>)?.[0];
  return JSON.parse(c?.text ?? "{}");
}

describe("full_text_search tool", () => {
  it("AC1+AC2: returns query, total, and hits with score/theme/formats", async () => {
    const fetchImpl = fakeFetch({
      packageSearch: (q, params) => {
        expect(q).toBe("calidad aire");
        expect(params.get("rows")).toBe("10");
        // No explicit sort — defer to CKAN/Solr default (score desc).
        expect(params.get("sort")).toBeNull();
        return {
          count: 4,
          results: [
            pkg({
              id: "h1",
              name: "hourly-air-quality-data-since-2016",
              title: "Datos calidad aire por hora",
              notes: "histórico desde 2016",
              score: 9.7,
              groups: [{ id: "g", name: "medio-ambiente" }],
              resources: [
                { id: "r", url: "u", format: "CSV" },
                { id: "r2", url: "u", format: "JSON" },
              ],
            }),
            pkg({
              id: "h2",
              name: "estaciones-control-aire",
              title: "Estaciones de control de aire",
              score: 5.2,
              groups: [{ id: "g", name: "medio-ambiente" }],
              resources: [{ id: "r3", url: "u", format: "GeoJSON" }],
            }),
          ],
        };
      },
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "full_text_search",
        arguments: { query: "calidad aire" },
      });
      const out = parsePayload(res) as {
        query: string;
        total: number;
        count: number;
        results: Array<{
          id: string;
          title: string;
          score: number | null;
          theme: string[];
          formats: string[];
        }>;
      };
      expect(out.query).toBe("calidad aire");
      expect(out.total).toBe(4);
      expect(out.count).toBe(2);
      expect(out.results[0]?.score).toBe(9.7);
      expect(out.results[0]?.theme).toEqual(["medio-ambiente"]);
      expect(out.results[0]?.formats.sort()).toEqual(["csv", "json"]);
    } finally {
      await close();
    }
  });

  it("AC3 (proxy): score-sorted results preserve upstream order", async () => {
    const fetchImpl = fakeFetch({
      packageSearch: () => ({
        count: 3,
        results: [
          pkg({ id: "top", title: "Top", score: 12 }),
          pkg({ id: "mid", title: "Mid", score: 7 }),
          pkg({ id: "low", title: "Low", score: 1 }),
        ],
      }),
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "full_text_search",
        arguments: { query: "anything" },
      });
      const out = parsePayload(res) as { results: Array<{ id: string }> };
      expect(out.results.map((r) => r.id)).toEqual(["top", "mid", "low"]);
    } finally {
      await close();
    }
  });

  it("AC1: fq array gets joined with space (Solr AND default)", async () => {
    const fetchImpl = fakeFetch({
      packageSearch: (_q, params) => {
        expect(params.get("fq")).toBe(
          "organization:ajuntament-de-valencia tags:movilidad",
        );
        return { count: 0, results: [] };
      },
    });
    const { client, close } = await harness(fetchImpl);
    try {
      await client.callTool({
        name: "full_text_search",
        arguments: {
          query: "x",
          fq: [
            "organization:ajuntament-de-valencia",
            "tags:movilidad",
          ],
        },
      });
    } finally {
      await close();
    }
  });

  it("AC1: rows > 30 rejected by Zod", async () => {
    const fetchImpl = fakeFetch({
      packageSearch: () => ({ count: 0, results: [] }),
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "full_text_search",
        arguments: { query: "x", rows: 100 },
      });
      expect(res.isError).toBe(true);
    } finally {
      await close();
    }
  });

  it("notes truncated to 240 chars in hits", async () => {
    const fetchImpl = fakeFetch({
      packageSearch: () => ({
        count: 1,
        results: [
          pkg({ id: "a", name: "a", title: "A", notes: "x".repeat(500) }),
        ],
      }),
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "full_text_search",
        arguments: { query: "x" },
      });
      const out = parsePayload(res) as {
        results: Array<{ notes_short: string }>;
      };
      const ns = out.results[0]?.notes_short ?? "";
      expect(ns.length).toBe(240);
      expect(ns.endsWith("…")).toBe(true);
    } finally {
      await close();
    }
  });
});
