import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcgisClient } from "../src/clients/arcgis.js";
import { CkanClient } from "../src/clients/ckan.js";
import { registerListDatasetsTool } from "../src/tools/list_datasets.js";
import { registerGetAirQualityTool } from "../src/tools/get_air_quality.js";
import { registerQueryGeoLayerTool } from "../src/tools/query_geo_layer.js";
import { registerGetTrafficStateTool } from "../src/tools/get_traffic_state.js";
import { registerGetNeighborhoodInfoTool } from "../src/tools/get_neighborhood_info.js";

// AC6: smoke check the "MCP no guarda los datos" invariant.
//
// 1. Every tool response under a typical call must stay under 1 MB. The
//    rationale: if a tool starts returning whole datasets, it has crossed
//    from "live pointer" into "replica". 1 MB is generous — most curated
//    tools return a few KB.
// 2. The cache module must not import any persistence-capable library.

const here = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(here, "..", "src");
const EXAMPLES_ROOT = resolve(here, "..", "examples");

const FORBIDDEN_IMPORTS = [
  "node:fs",
  "node:path",
  "fs/promises",
  "sqlite",
  "better-sqlite3",
  "level",
  "lowdb",
  "redis",
  "ioredis",
  "@vercel/kv",
];

async function callTool(
  register: (server: McpServer, ...d: never[]) => void,
  deps: unknown[],
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const server = new McpServer({ name: "t", version: "0.0.0" });
  // @ts-expect-error — varargs deps are tool-specific
  register(server, ...deps);
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({ name, arguments: args });
    return JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "{}");
  } finally {
    await client.close();
  }
}

function payloadSize(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

function listTsFiles(roots: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // directory may not exist (e.g. examples/ pre-VALMCP-16)
    }
    for (const entry of entries) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (entry.endsWith(".ts")) out.push(p);
    }
  };
  for (const r of roots) walk(r);
  return out;
}

describe("invariant — MCP no almacena (AC6)", () => {
  it("typical tool responses stay under 1 MB", async () => {
    const ckan = new CkanClient();
    const arcgis = new ArcgisClient();

    const probes: Array<{ name: string; payload: unknown }> = [];

    probes.push({
      name: "list_datasets",
      payload: await callTool(
        registerListDatasetsTool as never,
        [ckan],
        "list_datasets",
        { limit: 10 },
      ),
    });
    probes.push({
      name: "get_air_quality",
      payload: await callTool(
        registerGetAirQualityTool as never,
        [arcgis],
        "get_air_quality",
        {},
      ),
    });
    probes.push({
      name: "query_geo_layer",
      payload: await callTool(
        registerQueryGeoLayerTool as never,
        [arcgis],
        "query_geo_layer",
        {
          service: "OPENDATA/Trafico",
          layer_id: 228,
          where: "1=1",
          result_record_count: 50,
        },
      ),
    });
    probes.push({
      name: "get_traffic_state",
      payload: await callTool(
        registerGetTrafficStateTool as never,
        [arcgis],
        "get_traffic_state",
        { scope: "tramos", limit: 20 },
      ),
    });
    probes.push({
      name: "get_neighborhood_info",
      payload: await callTool(
        registerGetNeighborhoodInfoTool as never,
        [{ arcgis, ckan }],
        "get_neighborhood_info",
        { barri: "russafa" },
      ),
    });

    for (const p of probes) {
      const size = payloadSize(p.payload);
      expect(
        size,
        `${p.name} payload is ${size} bytes — > 1 MB violates the no-storage invariant`,
      ).toBeLessThan(1_000_000);
    }
  });

  it("source code does not import persistence libraries", () => {
    const offenders: Array<{ file: string; lib: string }> = [];
    for (const file of listTsFiles([SRC_ROOT, EXAMPLES_ROOT])) {
      const text = readFileSync(file, "utf8");
      for (const lib of FORBIDDEN_IMPORTS) {
        // Match `from "lib"` or `from "lib/sub"`.
        const re = new RegExp(`from\\s+["']${lib.replace(/[/.\\]/g, "\\$&")}(?:/[^"']+)?["']`);
        if (re.test(text)) offenders.push({ file, lib });
      }
    }
    expect(
      offenders,
      `Persistence imports detected: ${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([]);
  });

  it("examples write only to stdout (AC6 of VALMCP-16)", () => {
    // grep for direct disk-write APIs. fs imports already covered above.
    const banned = [/writeFileSync/, /appendFileSync/, /createWriteStream/, /fs\.write/];
    const offenders: Array<{ file: string; pattern: string }> = [];
    for (const file of listTsFiles([EXAMPLES_ROOT])) {
      const text = readFileSync(file, "utf8");
      for (const re of banned) {
        if (re.test(text)) offenders.push({ file, pattern: String(re) });
      }
    }
    expect(offenders).toEqual([]);
  });
});
