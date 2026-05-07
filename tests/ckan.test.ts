import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CkanClient } from "../src/clients/ckan.js";
import { CkanError } from "../src/types/ckan.js";
import { Cache } from "../src/cache.js";

function fakeFetch(
  responder: (url: string) => { status?: number; body: unknown },
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const { status = 200, body } = responder(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("CkanClient", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe("AC1 + AC2: methods and base URL", () => {
    it("exposes packageList/show/search, resourceShow, groupList and uses the València portal by default", () => {
      const client = new CkanClient();
      expect(client.baseURL).toBe(
        "https://opendata.vlci.valencia.es/api/3/action/",
      );
      expect(typeof client.packageList).toBe("function");
      expect(typeof client.packageShow).toBe("function");
      expect(typeof client.packageSearch).toBe("function");
      expect(typeof client.resourceShow).toBe("function");
      expect(typeof client.groupList).toBe("function");
    });

    it("baseURL is overridable via constructor (for testing)", () => {
      const client = new CkanClient({ baseURL: "https://example.test/api/" });
      expect(client.baseURL).toBe("https://example.test/api/");
    });
  });

  describe("AC3: in-memory cache", () => {
    it("returns cached result on second call within TTL", async () => {
      const fetchImpl = fakeFetch(() => ({
        body: { success: true, result: ["a", "b"] },
      }));
      const client = new CkanClient({ fetchImpl });

      const r1 = await client.packageList();
      const r2 = await client.packageList();

      expect(r1).toEqual(["a", "b"]);
      expect(r2).toEqual(["a", "b"]);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("does not cache across distinct query params", async () => {
      const fetchImpl = fakeFetch((url) => {
        const u = new URL(url);
        const id = u.searchParams.get("id");
        return {
          body: { success: true, result: { id, name: id, resources: [] } },
        };
      });
      const client = new CkanClient({ fetchImpl });

      await client.packageShow("a");
      await client.packageShow("b");

      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
  });

  describe("AC4: User-Agent header", () => {
    it("sends valencia-opendata-mcp UA by default", async () => {
      const fetchImpl = fakeFetch(() => ({
        body: { success: true, result: [] },
      }));
      const client = new CkanClient({ fetchImpl });
      await client.packageList();
      const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const headers = (call?.[1] as RequestInit | undefined)?.headers as
        | Record<string, string>
        | undefined;
      expect(headers?.["User-Agent"]).toMatch(
        /^valencia-opendata-mcp\/\S+ \(private dev\)$/,
      );
    });

    it("respects VLC_MCP_UA env override", async () => {
      const fetchImpl = fakeFetch(() => ({
        body: { success: true, result: [] },
      }));
      const prev = process.env.VLC_MCP_UA;
      process.env.VLC_MCP_UA = "custom-agent/9.9";
      try {
        const client = new CkanClient({ fetchImpl });
        await client.packageList();
        const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
          .calls[0];
        const headers = (call?.[1] as RequestInit | undefined)?.headers as
          | Record<string, string>
          | undefined;
        expect(headers?.["User-Agent"]).toBe("custom-agent/9.9");
      } finally {
        if (prev === undefined) delete process.env.VLC_MCP_UA;
        else process.env.VLC_MCP_UA = prev;
      }
    });
  });

  describe("AC5: CKAN error handling", () => {
    it("throws CkanError when envelope.success is false", async () => {
      const fetchImpl = fakeFetch(() => ({
        body: {
          success: false,
          error: { __type: "Not Found Error", message: "Package not found" },
        },
      }));
      const client = new CkanClient({ fetchImpl });
      await expect(client.packageShow("nope")).rejects.toBeInstanceOf(
        CkanError,
      );
      await expect(client.packageShow("nope")).rejects.toMatchObject({
        code: "Not Found Error",
        message: "Package not found",
      });
    });

    it("throws CkanError on HTTP non-2xx", async () => {
      const fetchImpl = fakeFetch(() => ({ status: 500, body: {} }));
      const client = new CkanClient({ fetchImpl });
      await expect(client.packageList()).rejects.toBeInstanceOf(CkanError);
    });
  });

  describe("AC6: no resource download surface", () => {
    it("does not expose downloadResource/fetchCsv/getResourceContent", () => {
      const client = new CkanClient() as unknown as Record<string, unknown>;
      expect(client.downloadResource).toBeUndefined();
      expect(client.fetchCsv).toBeUndefined();
      expect(client.getResourceContent).toBeUndefined();
    });
  });

  describe("Cache injection", () => {
    it("uses an injected Cache so callers can share/invalidate", async () => {
      const cache = new Cache<unknown>();
      const fetchImpl = fakeFetch(() => ({
        body: { success: true, result: ["x"] },
      }));
      const client = new CkanClient({ fetchImpl, cache });
      await client.packageList();
      expect(cache.size).toBe(1);
      cache.clear();
      await client.packageList();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
  });
});

describe("Invariant: src/clients/ does not import disk persistence", () => {
  it("no client imports node:fs, fs, path, sqlite, level, lowdb, redis", () => {
    const dir = join(process.cwd(), "src", "clients");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);

    const forbidden = [
      /from\s+["']node:fs(\/promises)?["']/,
      /from\s+["']fs(\/promises)?["']/,
      /from\s+["']node:path["']/,
      /from\s+["']path["']/,
      /from\s+["']sqlite/,
      /from\s+["']better-sqlite3["']/,
      /from\s+["']level/,
      /from\s+["']lowdb["']/,
      /from\s+["']redis["']/,
      /require\(["'](fs|fs\/promises|path|sqlite|level|lowdb|redis)/,
    ];

    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf-8");
      for (const pattern of forbidden) {
        expect(source, `${file} must not match ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }
  });
});
