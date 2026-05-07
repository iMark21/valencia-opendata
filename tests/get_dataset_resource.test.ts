import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CkanClient } from "../src/clients/ckan.js";
import { registerGetDatasetResourceTool } from "../src/tools/get_dataset_resource.js";
import type { CkanResource } from "../src/types/ckan.js";

function ckanFetch(handler: (id: string) => CkanResource | null): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const u = new URL(url);
    const action = u.pathname.split("/").pop();
    if (action === "resource_show") {
      const id = u.searchParams.get("id") ?? "";
      const r = handler(id);
      if (!r) {
        return new Response(
          JSON.stringify({
            success: false,
            error: { __type: "Not Found Error", message: "Resource not found" },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: true, result: r }), {
        status: 200,
      });
    }
    return new Response(
      JSON.stringify({ success: false, error: "unsupported" }),
      { status: 404 },
    );
  }) as unknown as typeof fetch;
}

async function harness(opts: {
  ckanFetchImpl: typeof fetch;
  toolFetchImpl?: typeof fetch;
}) {
  const ckan = new CkanClient({ fetchImpl: opts.ckanFetchImpl });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerGetDatasetResourceTool(server, {
    ckan,
    fetchImpl: opts.toolFetchImpl,
  });
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  return { client, close: () => client.close() };
}

function parsePayload(res: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const c = (res.content as Array<{ type: string; text: string }>)?.[0];
  return JSON.parse(c?.text ?? "{}");
}

describe("get_dataset_resource tool", () => {
  it("AC1+AC2: maps resource fields to documented shape", async () => {
    const ckanFetchImpl = ckanFetch(() => ({
      id: "r-1",
      package_id: "p-1",
      name: "ValenBisi JSON",
      url: "https://opendata.vlci.valencia.es/dataset/x/resource/r-1/download/file.json",
      format: "JSON",
      size: 12345,
      mimetype: "application/json",
      last_modified: "2026-05-01T00:00:00",
    }));
    const { client, close } = await harness({ ckanFetchImpl });
    try {
      const res = await client.callTool({
        name: "get_dataset_resource",
        arguments: { resource_id: "r-1" },
      });
      const out = parsePayload(res) as {
        resource_id: string;
        dataset_id: string;
        url: string;
        format: string;
        size_bytes: number;
        mimetype: string;
        last_modified: string;
        notes_for_llm: string;
      };
      expect(out.resource_id).toBe("r-1");
      expect(out.dataset_id).toBe("p-1");
      expect(out.format).toBe("JSON");
      expect(out.size_bytes).toBe(12345);
      expect(out.mimetype).toBe("application/json");
      expect(out.notes_for_llm).toBeDefined();
    } finally {
      await close();
    }
  });

  it("AC3: infer_schema=false (default) → no HEAD/Range, no schema", async () => {
    const ckanFetchImpl = ckanFetch(() => ({
      id: "r-csv",
      url: "https://opendata.vlci.valencia.es/dataset/x/resource/r-csv/download/data.csv",
      format: "CSV",
      size: 1000,
    }));
    const toolFetchImpl = vi.fn(); // should NEVER be called
    const { client, close } = await harness({
      ckanFetchImpl,
      toolFetchImpl: toolFetchImpl as unknown as typeof fetch,
    });
    try {
      const res = await client.callTool({
        name: "get_dataset_resource",
        arguments: { resource_id: "r-csv" },
      });
      const out = parsePayload(res) as { schema?: unknown };
      expect(out.schema).toBeUndefined();
      expect(toolFetchImpl).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("AC3: infer_schema=true on a CSV → returns columns from header, never the rows", async () => {
    const ckanFetchImpl = ckanFetch(() => ({
      id: "r-csv",
      url: "https://opendata.vlci.valencia.es/x.csv",
      format: "CSV",
      size: 50_000,
    }));
    const csvBody =
      "id,name,lat,lon,active\n1,Plaza Reina,39.475,-0.375,true\n2,Russafa,39.461,-0.376,false\n";
    const toolFetchImpl = vi.fn(async () => {
      return new Response(csvBody, {
        status: 206,
        headers: { "Content-Type": "text/csv" },
      });
    }) as unknown as typeof fetch;
    const { client, close } = await harness({
      ckanFetchImpl,
      toolFetchImpl,
    });
    try {
      const res = await client.callTool({
        name: "get_dataset_resource",
        arguments: { resource_id: "r-csv", infer_schema: true },
      });
      const out = parsePayload(res) as {
        schema?: {
          columns: Array<{ name: string; type_hint: string }>;
        };
      };
      expect(out.schema).toBeDefined();
      const cols = out.schema?.columns ?? [];
      expect(cols.map((c) => c.name)).toEqual([
        "id",
        "name",
        "lat",
        "lon",
        "active",
      ]);
      const idHint = cols.find((c) => c.name === "id")?.type_hint;
      const latHint = cols.find((c) => c.name === "lat")?.type_hint;
      const nameHint = cols.find((c) => c.name === "name")?.type_hint;
      expect(idHint).toBe("number");
      expect(latHint).toBe("number");
      expect(nameHint).toBe("string");
    } finally {
      await close();
    }
  });

  it("AC3: range request failure → no schema, no error to caller", async () => {
    const ckanFetchImpl = ckanFetch(() => ({
      id: "r-csv",
      url: "https://opendata.vlci.valencia.es/x.csv",
      format: "CSV",
      size: 50_000,
    }));
    const toolFetchImpl = vi.fn(async () => {
      return new Response("Not Acceptable", { status: 416 });
    }) as unknown as typeof fetch;
    const { client, close } = await harness({
      ckanFetchImpl,
      toolFetchImpl,
    });
    try {
      const res = await client.callTool({
        name: "get_dataset_resource",
        arguments: { resource_id: "r-csv", infer_schema: true },
      });
      const out = parsePayload(res) as { schema?: unknown; url?: string };
      expect(out.schema).toBeUndefined();
      expect(out.url).toBeDefined(); // still returns the resource metadata
    } finally {
      await close();
    }
  });

  it("AC4: never includes data/records/features/content fields", async () => {
    const ckanFetchImpl = ckanFetch(() => ({
      id: "r-1",
      url: "https://opendata.vlci.valencia.es/x.csv",
      format: "CSV",
      size: 100,
    }));
    const csvBody = "a,b,c\n1,2,3\n";
    const toolFetchImpl = vi.fn(async () => {
      return new Response(csvBody, { status: 206 });
    }) as unknown as typeof fetch;
    const { client, close } = await harness({
      ckanFetchImpl,
      toolFetchImpl,
    });
    try {
      const res = await client.callTool({
        name: "get_dataset_resource",
        arguments: { resource_id: "r-1", infer_schema: true },
      });
      const out = parsePayload(res) as Record<string, unknown>;
      expect(out.data).toBeUndefined();
      expect(out.records).toBeUndefined();
      expect(out.features).toBeUndefined();
      expect(out.content).toBeUndefined();
      expect(out.rows).toBeUndefined();
      expect(out.body).toBeUndefined();
    } finally {
      await close();
    }
  });

  it("AC5: large resource (>5MB) gets a size hint", async () => {
    const ckanFetchImpl = ckanFetch(() => ({
      id: "r-big",
      url: "https://opendata.vlci.valencia.es/historico-aire.csv",
      format: "CSV",
      size: 12_000_000,
    }));
    const { client, close } = await harness({ ckanFetchImpl });
    try {
      const res = await client.callTool({
        name: "get_dataset_resource",
        arguments: { resource_id: "r-big" },
      });
      const out = parsePayload(res) as { notes_for_llm: string };
      expect(out.notes_for_llm).toMatch(/Recurso grande/);
      expect(out.notes_for_llm).toMatch(/12\.0 MB/);
    } finally {
      await close();
    }
  });

  it("AC5: large CSV is NOT sniffed even with infer_schema=true", async () => {
    const ckanFetchImpl = ckanFetch(() => ({
      id: "r-big",
      url: "https://opendata.vlci.valencia.es/historico.csv",
      format: "CSV",
      size: 12_000_000,
    }));
    const toolFetchImpl = vi.fn();
    const { client, close } = await harness({
      ckanFetchImpl,
      toolFetchImpl: toolFetchImpl as unknown as typeof fetch,
    });
    try {
      const res = await client.callTool({
        name: "get_dataset_resource",
        arguments: { resource_id: "r-big", infer_schema: true },
      });
      const out = parsePayload(res) as { schema?: unknown };
      expect(out.schema).toBeUndefined();
      expect(toolFetchImpl).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("AC6: Geoportal URL gets a query_geo_layer hint", async () => {
    const ckanFetchImpl = ckanFetch(() => ({
      id: "r-vb",
      url: "https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/228/query?f=json",
      format: "JSON",
      size: 10_000,
    }));
    const { client, close } = await harness({ ckanFetchImpl });
    try {
      const res = await client.callTool({
        name: "get_dataset_resource",
        arguments: { resource_id: "r-vb" },
      });
      const out = parsePayload(res) as { notes_for_llm: string };
      expect(out.notes_for_llm).toMatch(/query_geo_layer/);
      expect(out.notes_for_llm).toMatch(/OPENDATA\/Trafico/);
      expect(out.notes_for_llm).toMatch(/layer=228/);
    } finally {
      await close();
    }
  });

  it("not found → returns CkanError mapped (no throw to MCP)", async () => {
    const ckanFetchImpl = ckanFetch(() => null);
    const { client, close } = await harness({ ckanFetchImpl });
    try {
      const res = await client.callTool({
        name: "get_dataset_resource",
        arguments: { resource_id: "missing" },
      });
      const out = parsePayload(res) as { error?: { code: string } };
      expect(out.error?.code).toBe("Not Found Error");
    } finally {
      await close();
    }
  });
});
