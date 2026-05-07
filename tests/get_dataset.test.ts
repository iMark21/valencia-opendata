import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CkanClient } from "../src/clients/ckan.js";
import {
  registerGetDatasetTool,
  extractGeoportalLayer,
} from "../src/tools/get_dataset.js";
import type { CkanPackage } from "../src/types/ckan.js";

function fakeFetchFor(handlers: {
  packageShow?: (id: string) => CkanPackage | { notFound: true };
  packageList?: () => string[];
}): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const u = new URL(url);
    const action = u.pathname.split("/").pop();
    if (action === "package_show") {
      const id = u.searchParams.get("id") ?? "";
      const r = handlers.packageShow?.(id);
      if (!r) {
        return new Response(
          JSON.stringify({ success: false, error: "no handler" }),
          { status: 200 },
        );
      }
      if ("notFound" in r) {
        return new Response(
          JSON.stringify({
            success: false,
            error: { __type: "Not Found Error", message: "Package not found" },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: true, result: r }), {
        status: 200,
      });
    }
    if (action === "package_list") {
      return new Response(
        JSON.stringify({
          success: true,
          result: handlers.packageList?.() ?? [],
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
  registerGetDatasetTool(server, ckan);
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

describe("get_dataset tool", () => {
  it("AC1+AC2: returns full metadata mapped to the documented shape", async () => {
    const fetchImpl = fakeFetchFor({
      packageShow: () => ({
        id: "abc-123",
        name: "valenbisi-disponibilitat-valenbisi-dsiponibilidad",
        title: "ValenBisi Disponibilitat",
        notes: "Estaciones de bicis.",
        organization: { id: "o1", name: "ajuntament-de-valencia" },
        groups: [{ id: "g", name: "transporte", title: "Transporte" }],
        tags: [
          { id: "t1", name: "transport", display_name: "Transporte" },
          { id: "t2", name: "bici" },
        ],
        license_id: "cc-by",
        license_title: "Atribución 4.0 Internacional (CC BY 4.0)",
        metadata_modified: "2026-05-01T00:00:00",
        resources: [
          {
            id: "r1",
            url: "https://example/resource.json",
            format: "JSON",
            size: 1024,
            mimetype: "application/json",
            last_modified: "2026-05-01T00:00:00",
            name: "ValenBisi JSON",
          },
        ],
      }),
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "get_dataset",
        arguments: {
          id: "valenbisi-disponibilitat-valenbisi-dsiponibilidad",
        },
      });
      const out = parsePayload(res) as {
        id: string;
        title: string;
        organization: string;
        theme: string[];
        license: string;
        tags: string[];
        resources: Array<{
          id: string;
          format: string;
          url: string;
          size_bytes: number;
        }>;
      };
      expect(out.id).toBe("abc-123");
      expect(out.title).toBe("ValenBisi Disponibilitat");
      expect(out.organization).toBe("ajuntament-de-valencia");
      expect(out.theme).toEqual(["transporte"]);
      expect(out.license).toContain("CC BY 4.0");
      expect(out.tags).toEqual(["Transporte", "bici"]);
      expect(out.resources).toHaveLength(1);
      expect(out.resources[0]?.format).toBe("JSON");
      expect(out.resources[0]?.size_bytes).toBe(1024);
    } finally {
      await close();
    }
  });

  it("AC3: not found returns suggestions sorted by similarity", async () => {
    const fetchImpl = fakeFetchFor({
      packageShow: () => ({ notFound: true }),
      packageList: () => [
        "valenbisi-disponibilitat-valenbisi-dsiponibilidad",
        "valenbisi-estacions-stations-locations",
        "trafico-tramos",
        "calidad-aire-estaciones",
      ],
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "get_dataset",
        arguments: { id: "valenbisi" },
      });
      const out = parsePayload(res) as {
        error?: { code: string; suggestions: string[] };
      };
      expect(out.error?.code).toBe("not_found");
      expect(out.error?.suggestions).toHaveLength(3);
      // both valenbisi entries should be in the top suggestions (substring match)
      expect(
        out.error?.suggestions.filter((s) => s.includes("valenbisi")),
      ).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it("AC4: extracts related_layers from Geoportal-pointing resources", async () => {
    const fetchImpl = fakeFetchFor({
      packageShow: () => ({
        id: "id-1",
        name: "valenbisi",
        resources: [
          {
            id: "r1",
            url: "https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/228/query?where=1=1&outFields=*&f=json",
            format: "JSON",
          },
          {
            id: "r2",
            url: "https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/228/query?f=geojson",
            format: "GeoJSON",
          },
          {
            id: "r3",
            url: "https://opendata.vlci.valencia.es/dataset/something.csv",
            format: "CSV",
          },
        ],
      }),
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "get_dataset",
        arguments: { id: "valenbisi" },
      });
      const out = parsePayload(res) as {
        related_layers?: Array<{ service: string; layer_id: number }>;
      };
      expect(out.related_layers).toBeDefined();
      // Two resources point to layer 228 — should dedupe to one.
      expect(out.related_layers).toHaveLength(1);
      expect(out.related_layers?.[0]).toEqual({
        service: "OPENDATA/Trafico",
        layer_id: 228,
      });
    } finally {
      await close();
    }
  });

  it("AC4: omits related_layers when no Geoportal URL is present", async () => {
    const fetchImpl = fakeFetchFor({
      packageShow: () => ({
        id: "id-2",
        name: "csv-only",
        resources: [
          {
            id: "r",
            url: "https://opendata.vlci.valencia.es/dataset/file.csv",
            format: "CSV",
          },
        ],
      }),
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "get_dataset",
        arguments: { id: "csv-only" },
      });
      const out = parsePayload(res) as {
        related_layers?: unknown;
      };
      expect(out.related_layers).toBeUndefined();
    } finally {
      await close();
    }
  });

  it("AC5: never includes raw resource content", async () => {
    const fetchImpl = fakeFetchFor({
      packageShow: () => ({
        id: "id-3",
        name: "x",
        resources: [{ id: "r", url: "u", format: "CSV" }],
      }),
    });
    const { client, close } = await harness(fetchImpl);
    try {
      const res = await client.callTool({
        name: "get_dataset",
        arguments: { id: "x" },
      });
      const out = parsePayload(res) as {
        resources: Array<Record<string, unknown>>;
      };
      // Resource entry exposes only metadata fields — no content/data/rows/features
      const r0 = out.resources[0]!;
      expect(r0.content).toBeUndefined();
      expect(r0.data).toBeUndefined();
      expect(r0.rows).toBeUndefined();
      expect(r0.features).toBeUndefined();
    } finally {
      await close();
    }
  });
});

describe("extractGeoportalLayer", () => {
  it("parses canonical service/layer URLs", () => {
    expect(
      extractGeoportalLayer(
        "https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/228/query?f=json",
      ),
    ).toEqual({ service: "OPENDATA/Trafico", layer_id: 228 });

    expect(
      extractGeoportalLayer(
        "https://geoportal.valencia.es/server/rest/services/OPENDATA/MedioAmbiente/MapServer/12",
      ),
    ).toEqual({ service: "OPENDATA/MedioAmbiente", layer_id: 12 });

    expect(
      extractGeoportalLayer(
        "https://geoportal.valencia.es/server/rest/services/OPENDATA/Turismo/MapServer/3/query",
      ),
    ).toEqual({ service: "OPENDATA/Turismo", layer_id: 3 });
  });

  it("returns null for non-matching URLs", () => {
    expect(extractGeoportalLayer("https://example.test/foo")).toBeNull();
    expect(
      extractGeoportalLayer(
        "https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer",
      ),
    ).toBeNull();
  });
});
