import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CkanClient } from "../clients/ckan.js";
import { CkanError, CkanPackage, CkanResource } from "../types/ckan.js";

const GEOPORTAL_LAYER_RE =
  /geoportal\.valencia\.es\/server\/rest\/services\/(.+?)\/MapServer\/(\d+)/i;

const description =
  "Returns full metadata for a single València open dataset by id (CKAN " +
  "package_show). Includes title, notes, organization, theme, license, all " +
  "resources (URL + format + last_modified), and tags. When a resource " +
  "points to the Geoportal ArcGIS REST endpoint, the response includes " +
  "related_layers so the agent can switch to query_geo_layer. Never returns " +
  "row content — use get_dataset_resource or query_geo_layer for that.";

const inputSchema = {
  id: z
    .string()
    .min(1)
    .describe(
      "Dataset id or slug (e.g. 'valenbisi-disponibilitat-valenbisi-dsiponibilidad'). " +
        "Get one from list_datasets.",
    ),
};

type Input = { id: string };

type Output = {
  id: string;
  title: string;
  notes: string;
  organization: string | null;
  theme: string[];
  license: string;
  metadata_modified: string | null;
  resources: Array<{
    id: string;
    name: string | null;
    format: string | null;
    size_bytes: number | null;
    url: string;
    last_modified: string | null;
    mimetype: string | null;
  }>;
  tags: string[];
  related_layers?: Array<{ service: string; layer_id: number }>;
};

export function registerGetDatasetTool(
  server: McpServer,
  ckan: CkanClient,
): void {
  server.tool(
    "get_dataset",
    description,
    inputSchema,
    async (raw: Input) => {
      const args = raw;
      try {
        const pkg = await ckan.packageShow(args.id);
        return jsonResult(toOutput(pkg));
      } catch (err) {
        if (err instanceof CkanError && isNotFound(err)) {
          let suggestions: string[] = [];
          try {
            const all = await ckan.packageList();
            suggestions = suggestIds(args.id, all, 3);
          } catch {
            // suggestions are best-effort; missing them is not blocking
          }
          return jsonResult({
            error: {
              code: "not_found",
              message: `Dataset "${args.id}" not found.`,
              suggestions,
            },
          });
        }
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

function isNotFound(err: CkanError): boolean {
  return /not\s*found/i.test(err.code) || /not\s*found/i.test(err.message);
}

function toOutput(pkg: CkanPackage): Output {
  const resources = (pkg.resources ?? []).map(toResource);
  const related = collectRelatedLayers(pkg);

  return {
    id: pkg.id,
    title: pkg.title ?? pkg.name,
    notes: (pkg.notes ?? "").trim(),
    organization: pkg.organization?.name ?? null,
    theme: (pkg.groups ?? []).map((g) => g.name),
    license:
      pkg.license_title ??
      pkg.license_id ??
      "cc-by — Atribución 4.0 Internacional (CC BY 4.0)",
    metadata_modified: pkg.metadata_modified ?? null,
    resources,
    tags: (pkg.tags ?? []).map((t) => t.display_name ?? t.name),
    ...(related.length > 0 ? { related_layers: related } : {}),
  };
}

function toResource(r: CkanResource): Output["resources"][number] {
  return {
    id: r.id,
    name: r.name ?? null,
    format: r.format ?? null,
    size_bytes:
      typeof r.size === "number"
        ? r.size
        : r.size === null || r.size === undefined
          ? null
          : Number.isFinite(Number(r.size))
            ? Number(r.size)
            : null,
    url: r.url,
    last_modified: r.last_modified ?? null,
    mimetype: r.mimetype ?? null,
  };
}

export function extractGeoportalLayer(
  url: string,
): { service: string; layer_id: number } | null {
  const m = GEOPORTAL_LAYER_RE.exec(url);
  if (!m) return null;
  const service = m[1];
  const layerId = Number(m[2]);
  if (!service || !Number.isFinite(layerId)) return null;
  return { service, layer_id: layerId };
}

function collectRelatedLayers(
  pkg: CkanPackage,
): Array<{ service: string; layer_id: number }> {
  const candidates: string[] = [];
  if (pkg.notes) candidates.push(pkg.notes);
  for (const r of pkg.resources ?? []) {
    if (r.url) candidates.push(r.url);
  }

  const seen = new Set<string>();
  const out: Array<{ service: string; layer_id: number }> = [];
  for (const s of candidates) {
    // Multiple URLs may live in a single string — scan with a global regex.
    const re = new RegExp(GEOPORTAL_LAYER_RE.source, "gi");
    let match: RegExpExecArray | null;
    while ((match = re.exec(s)) !== null) {
      const service = match[1];
      const layerId = Number(match[2]);
      if (!service || !Number.isFinite(layerId)) continue;
      const key = `${service}#${layerId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ service, layer_id: layerId });
    }
  }
  return out;
}

function suggestIds(input: string, all: string[], k: number): string[] {
  const lower = input.toLowerCase();
  return all
    .map((id) => ({
      id,
      // Substring match short-circuits to distance 0.
      d: id.toLowerCase().includes(lower)
        ? 0
        : levenshtein(lower, id.toLowerCase()),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((s) => s.id);
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
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}
