import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CkanClient } from "../clients/ckan.js";
import { CkanError, CkanPackage } from "../types/ckan.js";

const FORMATS = [
  "csv",
  "json",
  "geojson",
  "shp",
  "kmz",
  "xlsx",
  "wfs",
  "wms",
] as const;

const NOTES_LIMIT = 240;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const inputSchema = {
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Free-text search across dataset titles, notes, and tags."),
  theme: z
    .string()
    .min(1)
    .optional()
    .describe(
      "CKAN group slug (e.g. 'transporte', 'medio-ambiente'). " +
        "Returns unknown_theme with fuzzy suggestions if not found.",
    ),
  format: z
    .enum(FORMATS)
    .optional()
    .describe(
      "Restrict to datasets with at least one resource in this format.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Max results (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Pagination offset (default 0)."),
};

type Input = {
  query?: string;
  theme?: string;
  format?: (typeof FORMATS)[number];
  limit?: number;
  offset?: number;
};

type ResultEntry = {
  id: string;
  title: string;
  notes_short: string;
  theme: string[];
  formats: string[];
  last_updated: string | null;
  url: string;
};

const description =
  "Search and filter the catalog of City of València open datasets " +
  "(294 datasets, CC BY 4.0). Live query against the municipal CKAN portal — " +
  "no replication. Returns dataset metadata only (id, title, theme, formats, " +
  "last_updated). Use get_dataset for full metadata, get_dataset_resource for " +
  "downloadable URLs. Scope: municipal term of València only.";

export function registerListDatasetsTool(
  server: McpServer,
  ckan: CkanClient,
): void {
  server.tool(
    "list_datasets",
    description,
    inputSchema,
    async (raw: Input) => {
      const args: Input = raw ?? {};
      try {
        // Validate theme against the live group catalog when provided.
        if (args.theme) {
          const groups = await ckan.groupList();
          if (!groups.includes(args.theme)) {
            return jsonResult({
              error: {
                code: "unknown_theme",
                message: `Theme "${args.theme}" is not a València CKAN group.`,
                suggestions: suggestThemes(args.theme, groups),
              },
            });
          }
        }

        const limit = args.limit ?? DEFAULT_LIMIT;
        const offset = args.offset ?? 0;

        // Pull a generous batch when format filtering, since post-filter can
        // shrink the result. Cap at MAX_LIMIT * 4 to stay polite.
        const fetchRows = args.format ? Math.min(limit * 4, MAX_LIMIT * 4) : limit;

        const search = await ckan.packageSearch(args.query ?? "*:*", {
          rows: fetchRows,
          start: offset,
          sort: "metadata_modified desc",
          fq: args.theme ? `groups:${args.theme}` : undefined,
        });

        let filtered: CkanPackage[] = search.results;
        if (args.format) {
          const fmt = args.format.toLowerCase();
          filtered = filtered.filter((pkg) =>
            (pkg.resources ?? []).some(
              (r) => (r.format ?? "").toLowerCase() === fmt,
            ),
          );
        }

        const trimmed = filtered.slice(0, limit);

        const results: ResultEntry[] = trimmed.map(toResultEntry);

        return jsonResult({
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
            error: {
              code: err.code,
              message: err.message,
            },
          });
        }
        throw err;
      }
    },
  );
}

function toResultEntry(pkg: CkanPackage): ResultEntry {
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
  const theme = (pkg.groups ?? []).map((g) => g.name);
  return {
    id: pkg.id,
    title: pkg.title ?? pkg.name,
    notes_short: notesShort,
    theme,
    formats,
    last_updated: pkg.metadata_modified ?? null,
    url: `https://opendata.vlci.valencia.es/dataset/${pkg.name}`,
  };
}

function suggestThemes(input: string, groups: string[], k = 5): string[] {
  const scored = groups
    .map((g) => ({ g, d: levenshtein(input.toLowerCase(), g.toLowerCase()) }))
    .sort((a, b) => a.d - b.d);
  return scored.slice(0, k).map((s) => s.g);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

function jsonResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}
