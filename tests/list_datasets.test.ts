import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CkanClient } from "../src/clients/ckan.js";
import { registerListDatasetsTool } from "../src/tools/list_datasets.js";
import type { CkanPackage } from "../src/types/ckan.js";

const REAL_GROUPS = [
  "ciencia-tecnologia",
  "comercio",
  "cultura-ocio",
  "demografia",
  "deporte",
  "economia",
  "educacion",
  "empleo",
  "energia",
  "hacienda",
  "industria",
  "legislacion-justicia",
  "medio-ambiente",
  "medio-rural-pesca",
  "salud",
  "sector-publico",
  "seguridad",
  "sociedad-bienestar",
  "transporte",
  "turismo",
  "urbanismo-infraestructuras",
  "vivienda",
];

function pkg(over: Partial<CkanPackage>): CkanPackage {
  return {
    id: over.id ?? "id",
    name: over.name ?? "slug",
    title: over.title ?? "Title",
    notes: over.notes ?? "",
    organization: null,
    groups: over.groups ?? [],
    tags: [],
    resources: over.resources ?? [],
    metadata_modified: over.metadata_modified ?? "2026-05-01T00:00:00",
    ...over,
  };
}

function fakeFetchFor(handler: {
  groupList?: () => string[];
  packageSearch?: (
    q: string,
    params: URLSearchParams,
  ) => { count: number; results: CkanPackage[] };
}): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const u = new URL(url);
    const action = u.pathname.split("/").pop();

    if (action === "group_list") {
      return new Response(
        JSON.stringify({
          success: true,
          result: handler.groupList?.() ?? REAL_GROUPS,
        }),
        { status: 200 },
      );
    }
    if (action === "package_search") {
      const q = u.searchParams.get("q") ?? "";
      const result = handler.packageSearch
        ? handler.packageSearch(q, u.searchParams)
        : { count: 0, results: [] };
      return new Response(
        JSON.stringify({ success: true, result }),
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
  registerListDatasetsTool(server, ckan);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(s), client.connect(c)]);
  return { client, close: () => client.close() };
}

function parsePayload(res: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const content = (res.content as Array<{ type: string; text: string }>)?.[0];
  return JSON.parse(content?.text ?? "{}");
}

describe("list_datasets tool", () => {
  it("AC1+AC2+AC3: defaults (no args) → 20 most recent, structured output", async () => {
    const fetchImpl = fakeFetchFor({
      packageSearch: (_q, params) => {
        // Defaults: rows=20, sort=metadata_modified desc, no fq
        expect(params.get("sort")).toBe("metadata_modified desc");
        expect(params.get("rows")).toBe("20");
        return {
          count: 294,
          results: Array.from({ length: 20 }).map((_, i) =>
            pkg({
              id: `id-${i}`,
              name: `slug-${i}`,
              title: `Dataset ${i}`,
              notes: "Lorem ipsum",
              resources: [{ id: `r${i}`, url: "u", format: "CSV" }],
              groups: [{ id: "g", name: "transporte" }],
            }),
          ),
        };
      },
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({ name: "list_datasets", arguments: {} });
      const out = parsePayload(res) as {
        total: number;
        count: number;
        results: Array<{
          id: string;
          title: string;
          notes_short: string;
          formats: string[];
          theme: string[];
          last_updated: string | null;
          url: string;
        }>;
        source: { endpoint: string };
      };
      expect(out.total).toBe(294);
      expect(out.count).toBe(20);
      expect(out.results).toHaveLength(20);
      expect(out.results[0]?.formats).toEqual(["csv"]);
      expect(out.results[0]?.theme).toEqual(["transporte"]);
      expect(out.results[0]?.url).toBe(
        "https://opendata.vlci.valencia.es/dataset/slug-0",
      );
      expect(out.source.endpoint).toBe("package_search");
    } finally {
      await close();
    }
  });

  it("AC2: notes truncated to 240 chars with ellipsis", async () => {
    const long = "x".repeat(500);
    const fetchImpl = fakeFetchFor({
      packageSearch: () => ({
        count: 1,
        results: [pkg({ id: "a", name: "a", title: "A", notes: long })],
      }),
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({ name: "list_datasets", arguments: {} });
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

  it("AC4: filter by theme passes fq=groups:<name>", async () => {
    const fetchImpl = fakeFetchFor({
      packageSearch: (_q, params) => {
        expect(params.get("fq")).toBe("groups:transporte");
        return { count: 5, results: [] };
      },
    });
    const { client, close } = await harness(fetchImpl);
    try {
      await client.callTool({
        name: "list_datasets",
        arguments: { theme: "transporte" },
      });
    } finally {
      await close();
    }
  });

  it("AC4: unknown theme returns error with fuzzy suggestions", async () => {
    const fetchImpl = fakeFetchFor({
      packageSearch: () => ({ count: 0, results: [] }),
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "list_datasets",
        arguments: { theme: "movilidad" },
      });
      const out = parsePayload(res) as {
        error?: { code: string; suggestions?: string[] };
      };
      expect(out.error?.code).toBe("unknown_theme");
      expect(out.error?.suggestions).toBeDefined();
      expect(out.error?.suggestions?.length).toBeGreaterThan(0);
      // suggestions must be valid CKAN groups
      for (const s of out.error?.suggestions ?? []) {
        expect(REAL_GROUPS).toContain(s);
      }
    } finally {
      await close();
    }
  });

  it("AC5: filter by format keeps only datasets with at least one matching resource", async () => {
    const fetchImpl = fakeFetchFor({
      packageSearch: () => ({
        count: 3,
        results: [
          pkg({
            id: "1",
            name: "geo1",
            resources: [{ id: "a", url: "u", format: "GeoJSON" }],
          }),
          pkg({
            id: "2",
            name: "csv-only",
            resources: [{ id: "b", url: "u", format: "CSV" }],
          }),
          pkg({
            id: "3",
            name: "geo2",
            resources: [
              { id: "c", url: "u", format: "CSV" },
              { id: "d", url: "u", format: "GEOJSON" },
            ],
          }),
        ],
      }),
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "list_datasets",
        arguments: { format: "geojson" },
      });
      const out = parsePayload(res) as {
        count: number;
        results: Array<{ id: string }>;
      };
      expect(out.count).toBe(2);
      expect(out.results.map((r) => r.id).sort()).toEqual(["1", "3"]);
    } finally {
      await close();
    }
  });

  it("input validation: limit > 50 is rejected by Zod", async () => {
    const fetchImpl = fakeFetchFor({});
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "list_datasets",
        arguments: { limit: 100 },
      });
      // MCP returns isError on validation failure
      expect(res.isError).toBe(true);
    } finally {
      await close();
    }
  });
});
