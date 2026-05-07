import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CkanClient } from "../clients/ckan.js";
import { CkanError, CkanPackage } from "../types/ckan.js";

const NOTES_LIMIT = 240;
const DEFAULT_ROWS = 10;
const MAX_ROWS = 30;

const description =
  "Full-text search across the València CKAN catalog (294 datasets). " +
  "Searches title, description, tags and organization with Solr scoring. " +
  "Use when the user describes data without knowing the exact dataset name. " +
  "Differs from list_datasets: this one prioritizes relevance, not filtering.";

const inputSchema = {
  query: z
    .string()
    .min(1)
    .describe("Free-text search query (Solr syntax accepted)."),
  fq: z
    .array(z.string())
    .optional()
    .describe(
      "Optional CKAN/Solr filter queries (e.g. ['organization:ajuntament-de-valencia']).",
    ),
  rows: z
    .number()
    .int()
    .min(1)
    .max(MAX_ROWS)
    .optional()
    .describe(`Max results (default ${DEFAULT_ROWS}, max ${MAX_ROWS}).`),
  start: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Pagination offset (default 0)."),
};

type Input = {
  query: string;
  fq?: string[];
  rows?: number;
  start?: number;
};

type Hit = {
  id: string;
  title: string;
  notes_short: string;
  score: number | null;
  theme: string[];
  formats: string[];
};

export function registerFullTextSearchTool(
  server: McpServer,
  ckan: CkanClient,
): void {
  server.tool(
    "full_text_search",
    description,
    inputSchema,
    async (raw: Input) => {
      const args = raw;
      try {
        const fq = args.fq && args.fq.length > 0
          ? args.fq.join(" ")
          : undefined;
        // Default sort is by score desc — let CKAN/Solr decide.
        const search = await ckan.packageSearch(args.query, {
          rows: args.rows ?? DEFAULT_ROWS,
          start: args.start,
          fq,
        });

        const results: Hit[] = search.results.map((pkg) => toHit(pkg));

        return jsonResult({
          query: args.query,
          total: search.count,
          count: results.length,
          results,
          source: {
            endpoint: "package_search",
            attribution:
              "Datos: Ajuntament de València (CC BY 4.0). " +
              "https://opendata.vlci.valencia.es",
          },
        });
      } catch (err) {
        if (err instanceof CkanError) {
          return jsonResult({
            error: { code: err.code, message: err.message },
          });
        }
        throw err;
      }
    },
  );
}

function toHit(pkg: CkanPackage): Hit {
  const notes = (pkg.notes ?? "").trim();
  const notesShort =
    notes.length > NOTES_LIMIT ? `${notes.slice(0, NOTES_LIMIT - 1)}…` : notes;
  const formats = Array.from(
    new Set(
      (pkg.resources ?? [])
        .map((r) => (r.format ?? "").toLowerCase())
        .filter((s) => s.length > 0),
    ),
  );
  const score =
    typeof pkg.score === "number"
      ? pkg.score
      : typeof pkg.score === "string" && Number.isFinite(Number(pkg.score))
        ? Number(pkg.score)
        : null;
  return {
    id: pkg.id,
    title: pkg.title ?? pkg.name,
    notes_short: notesShort,
    score,
    theme: (pkg.groups ?? []).map((g) => g.name),
    formats,
  };
}

function jsonResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}
