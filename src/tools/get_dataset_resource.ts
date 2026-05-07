import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CkanClient } from "../clients/ckan.js";
import { CkanError, CkanResource } from "../types/ckan.js";

const GEOPORTAL_LAYER_RE =
  /geoportal\.valencia\.es\/server\/rest\/services\/(.+?)\/MapServer\/(\d+)/i;

const LARGE_RESOURCE_THRESHOLD = 5_000_000;
const RANGE_BYTES = 2048;
const SCHEMA_TIMEOUT_MS = 4000;

const description =
  "Returns metadata for a single resource (URL, format, size, last_modified, " +
  "optional schema). NEVER returns the resource bytes — the agent must fetch " +
  "the URL itself or pick a more specific tool. Use infer_schema=true to peek " +
  "at the first few KB of CSV/JSON resources for column hints (HEAD + Range " +
  "request, never a full download).";

const inputSchema = {
  resource_id: z
    .string()
    .min(1)
    .describe("CKAN resource id (UUID). Find one via get_dataset."),
  infer_schema: z
    .boolean()
    .optional()
    .describe(
      "Default false. When true, sniffs the first 2KB of CSV/JSON resources " +
        "to infer column names and rough types. Never downloads the full file.",
    ),
};

type Input = { resource_id: string; infer_schema?: boolean };

type SchemaColumn = { name: string; type_hint: "number" | "string" | "unknown" };
type Schema = { columns: SchemaColumn[]; sniffed_bytes: number };

type Output = {
  resource_id: string;
  dataset_id: string | null;
  name: string | null;
  format: string | null;
  url: string;
  size_bytes: number | null;
  mimetype: string | null;
  last_modified: string | null;
  schema?: Schema;
  notes_for_llm: string;
};

export type GetDatasetResourceDeps = {
  ckan: CkanClient;
  fetchImpl?: typeof fetch;
};

export function registerGetDatasetResourceTool(
  server: McpServer,
  deps: GetDatasetResourceDeps,
): void {
  const fetchImpl = deps.fetchImpl ?? fetch;

  server.tool(
    "get_dataset_resource",
    description,
    inputSchema,
    async (raw: Input) => {
      const args = raw;
      try {
        const r = await deps.ckan.resourceShow(args.resource_id);
        const base = toBase(r);

        let schema: Schema | undefined;
        if (args.infer_schema && shouldSniff(base)) {
          schema = await sniffSchema(base, fetchImpl);
        }

        return jsonResult({
          ...base,
          ...(schema ? { schema } : {}),
          notes_for_llm: buildNotes(base),
        } satisfies Output);
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

function toBase(r: CkanResource): Omit<Output, "schema" | "notes_for_llm"> {
  return {
    resource_id: r.id,
    dataset_id:
      typeof r.package_id === "string" && r.package_id.length > 0
        ? r.package_id
        : null,
    name: r.name ?? null,
    format: r.format ?? null,
    url: r.url,
    size_bytes:
      typeof r.size === "number"
        ? r.size
        : r.size === null || r.size === undefined
          ? null
          : Number.isFinite(Number(r.size))
            ? Number(r.size)
            : null,
    mimetype: r.mimetype ?? null,
    last_modified: r.last_modified ?? null,
  };
}

function shouldSniff(
  base: Omit<Output, "schema" | "notes_for_llm">,
): boolean {
  if (!base.format) return false;
  const fmt = base.format.toLowerCase();
  if (!["csv", "json", "geojson"].includes(fmt)) return false;
  if (
    typeof base.size_bytes === "number" &&
    base.size_bytes > LARGE_RESOURCE_THRESHOLD
  ) {
    return false;
  }
  return true;
}

async function sniffSchema(
  base: Omit<Output, "schema" | "notes_for_llm">,
  fetchImpl: typeof fetch,
): Promise<Schema | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCHEMA_TIMEOUT_MS);
  try {
    const res = await fetchImpl(base.url, {
      headers: { Range: `bytes=0-${RANGE_BYTES - 1}` },
      signal: controller.signal,
    });
    if (!res.ok && res.status !== 206) return undefined;
    const text = await res.text();
    const fmt = (base.format ?? "").toLowerCase();
    if (fmt === "csv") return parseCsvHeader(text);
    if (fmt === "json" || fmt === "geojson") return parseJsonShape(text);
    return undefined;
  } catch {
    // Network/timeout/parse — schema sniffing is best-effort.
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function parseCsvHeader(text: string): Schema | undefined {
  const lines = text.split(/\r?\n/);
  const header = lines[0];
  if (!header) return undefined;
  const sample = lines[1];
  const names = splitCsv(header);
  const samples = sample ? splitCsv(sample) : [];
  const columns: SchemaColumn[] = names.map((name, i) => ({
    name: name.replace(/^"|"$/g, "").trim(),
    type_hint: hintFromValue(samples[i]),
  }));
  return { columns, sniffed_bytes: text.length };
}

function parseJsonShape(text: string): Schema | undefined {
  // Best-effort: try to parse a partial array of objects or a top-level object.
  // For GeoJSON, look for the first feature's properties.
  // We trim the text to the last balanced-brace point to maximize parse success.
  for (let len = text.length; len > 0; len--) {
    const slice = text.slice(0, len);
    try {
      const parsed = JSON.parse(slice) as unknown;
      return columnsFromJson(parsed, text.length);
    } catch {
      // try a shorter slice
    }
    // brace-truncate trick: stop trying at obvious cliffs
    if (len < text.length - 64) break;
  }
  // Try to extract first object from an array prefix like `[{...},`.
  const m = /\[\s*({[\s\S]*?})\s*[,\]]/.exec(text);
  if (m) {
    try {
      const obj = JSON.parse(m[1] ?? "");
      return columnsFromJson(obj, text.length);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function columnsFromJson(parsed: unknown, sniffed: number): Schema | undefined {
  let target: Record<string, unknown> | undefined;
  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
    target = parsed[0] as Record<string, unknown>;
  } else if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    // GeoJSON FeatureCollection
    if (
      obj.type === "FeatureCollection" &&
      Array.isArray(obj.features) &&
      obj.features.length > 0
    ) {
      const feat = obj.features[0] as Record<string, unknown>;
      const props = feat.properties;
      if (props && typeof props === "object")
        target = props as Record<string, unknown>;
    } else {
      target = obj;
    }
  }
  if (!target) return undefined;
  const columns: SchemaColumn[] = Object.entries(target).map(([k, v]) => ({
    name: k,
    type_hint: hintFromValue(v),
  }));
  return { columns, sniffed_bytes: sniffed };
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        buf += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        buf += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === "," || ch === ";") {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out;
}

function hintFromValue(v: unknown): SchemaColumn["type_hint"] {
  if (v === undefined || v === null || v === "") return "unknown";
  if (typeof v === "number") return "number";
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return "unknown";
    if (!Number.isNaN(Number(trimmed))) return "number";
    return "string";
  }
  return "unknown";
}

function buildNotes(
  base: Omit<Output, "schema" | "notes_for_llm">,
): string {
  const parts: string[] = [];
  if (
    typeof base.size_bytes === "number" &&
    base.size_bytes > LARGE_RESOURCE_THRESHOLD
  ) {
    const mb = (base.size_bytes / 1_000_000).toFixed(1);
    parts.push(
      `Recurso grande (${mb} MB). Descarga del lado cliente o usa una tool específica si existe (ej. get_air_quality para histórico aire).`,
    );
  }
  const m = GEOPORTAL_LAYER_RE.exec(base.url);
  if (m) {
    parts.push(
      `Capa Geoportal. Prefiere query_geo_layer con service="${m[1]}" layer=${m[2]} para queries selectivas.`,
    );
  }
  if (parts.length === 0) {
    parts.push(
      "Use the URL directly to download. Attribution required: Ajuntament de València (CC BY 4.0).",
    );
  }
  return parts.join(" ");
}

function jsonResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}
