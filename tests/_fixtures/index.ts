// Fetch interceptor for record/replay integration tests.
//
// Modes (mutually exclusive, picked from env):
//   default    → REPLAY: read fixture from disk; throw if missing.
//   RECORD=1   → RECORD: fetch live, write fixture, return response.
//   INTEGRATION=1 → PASSTHROUGH: fetch live, do not touch disk
//                   (legacy mode preserved for ad-hoc runs).
//
// Fixture path: tests/fixtures/<host>/<slug>__<sha1prefix>.json
// Slug: readable summary of the request (path + key query params).
// Hash:  prefix of sha1(method + url + body) — disambiguates similar URLs.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Mode = "replay" | "record" | "passthrough";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = resolve(here, "..", "fixtures");

function pickMode(): Mode {
  if (process.env.RECORD === "1") return "record";
  if (process.env.INTEGRATION === "1") return "passthrough";
  return "replay";
}

type StoredFixture = {
  request: { method: string; url: string; body: string | null };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  };
  recorded_at: string;
};

function fixturePath(method: string, url: string, body: string | null): string {
  const u = new URL(url);
  const host = u.host.replace(/[^a-z0-9.-]/gi, "_");
  const slugParts = [
    u.pathname.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "_") ||
      "root",
  ];
  // Include a few notable query params verbatim so fixture filenames stay
  // readable when several URLs share a path (e.g. CKAN action endpoint).
  const notable = ["q", "id", "where", "outFields", "rows", "start"];
  for (const k of notable) {
    const v = u.searchParams.get(k);
    if (v) slugParts.push(`${k}-${v.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}`);
  }
  const slug = slugParts.join("__").slice(0, 120);
  const hash = createHash("sha1")
    .update(method)
    .update("\0")
    .update(url)
    .update("\0")
    .update(body ?? "")
    .digest("hex")
    .slice(0, 10);
  return join(FIXTURES_ROOT, host, `${slug}__${hash}.json`);
}

function summarize(method: string, url: string): string {
  return `${method} ${url.length > 140 ? url.slice(0, 137) + "…" : url}`;
}

async function bodyAsString(init: RequestInit | undefined): Promise<string | null> {
  if (!init || init.body == null) return null;
  if (typeof init.body === "string") return init.body;
  if (init.body instanceof URLSearchParams) return init.body.toString();
  return null;
}

function buildResponse(stored: StoredFixture["response"]): Response {
  return new Response(stored.body, {
    status: stored.status,
    statusText: stored.statusText,
    headers: stored.headers,
  });
}

let originalFetch: typeof fetch | null = null;
let installed = false;

export function installFetchInterceptor(): void {
  if (installed) return;
  installed = true;
  originalFetch = globalThis.fetch;
  const mode = pickMode();

  const intercepted: typeof fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const method = (init?.method ?? req.method ?? "GET").toUpperCase();
    const url = req.url;
    const body = await bodyAsString(init);

    if (mode === "passthrough") {
      return originalFetch!(input, init);
    }

    const path = fixturePath(method, url, body);

    if (mode === "replay") {
      if (!existsSync(path)) {
        throw new Error(
          `[record/replay] Missing fixture for ${summarize(method, url)}\n` +
            `Expected: ${path}\n` +
            `Run with RECORD=1 npm test to capture it.`,
        );
      }
      const stored = JSON.parse(readFileSync(path, "utf8")) as StoredFixture;
      return buildResponse(stored.response);
    }

    // record
    const live = await originalFetch!(input, init);
    const text = await live.clone().text();
    const headers: Record<string, string> = {};
    live.headers.forEach((v, k) => {
      // Avoid header churn that would dirty the diff between recordings.
      if (/^(date|server|x-|set-cookie|cf-|via|cache-control|expires|age|etag|last-modified)/i.test(k))
        return;
      if (k.toLowerCase() === "content-encoding") return;
      headers[k] = v;
    });
    const stored: StoredFixture = {
      request: { method, url, body },
      response: {
        status: live.status,
        statusText: live.statusText,
        headers,
        body: text,
      },
      recorded_at: new Date().toISOString().slice(0, 10),
    };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(stored, null, 2) + "\n", "utf8");
    return buildResponse(stored.response);
  };

  globalThis.fetch = intercepted;
}

export function currentMode(): Mode {
  return pickMode();
}
