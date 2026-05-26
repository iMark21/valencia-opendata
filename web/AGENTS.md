# valencIA web — agent context

## What this is

Next.js 14 chat interface for the `valencia-opendata` MCP server. Displays real-time data from
the 294 open datasets of the Ajuntament de València (CKAN + Geoportal ArcGIS, CC BY 4.0).

## Monorepo layout

This `web/` directory lives inside `valencia-mcp/` (monorepo root). The MCP server is at `../src/`.

```
valencia-mcp/          ← monorepo root (npm workspace)
├── src/               ← MCP server source
├── dist/              ← compiled MCP (npm run build from root)
└── web/               ← this Next.js app
    ├── app/
    │   ├── api/chat/route.ts   ← SSE endpoint: LLM + tool calls
    │   ├── page.tsx            ← full chat UI (single-page)
    │   └── globals.css         ← responsive breakpoints (640px)
    ├── components/
    │   ├── AirQualityCard.tsx  ← EAQI inline card (bilingual es/val)
    │   ├── ValenBisiCard.tsx   ← ValenBisi bike availability card
    │   └── MapCard.tsx         ← Leaflet mini-map card
    └── lib/
        ├── mcp-bridge.ts       ← InMemoryTransport bridge to MCP server
        ├── geocoder.ts         ← Nominatim geocoding
        ├── openrouter-tools.ts ← OpenRouter tool definitions
        └── types.ts
```

## Running locally

```sh
# From monorepo root — build MCP first:
npm install && npm run build

# From web/:
npm install
cp .env.example .env.local   # set OPENROUTER_API_KEY
npm run dev                  # http://localhost:3000
```

`next.config.ts` aliases `@mcp/dist/*` → `../dist/*` so the web can import the compiled MCP
without publishing to npm.

## Architecture — MCP bridge

The API route `/api/chat` runs the MCP server **in-process** via `InMemoryTransport`.
No subprocess, no network hop. `lib/mcp-bridge.ts` creates a fresh server + client pair
per tool call, with a 20 s timeout via `Promise.race`.

```
Browser → SSE → /api/chat → mcp-bridge (InMemoryTransport) → CKAN / Geoportal ArcGIS
```

## LLM — OpenRouter

Model fallback chain (in order): `openai/gpt-oss-120b:free` → `meta-llama/llama-3.3-70b-instruct:free`.
Streaming via SSE. Tool calls follow OpenRouter's OpenAI-compatible format.

## Data constraint (hard rule)

**Only CKAN (`opendata.vlci.valencia.es`) and Geoportal ArcGIS (`geoportal.valencia.es`).**
Never add scrapers for municipal websites — contest rule for Premios Datos Abiertos València IV.

## UI language

The interface is bilingual Valencian (`val`) / Spanish (`es`). A toggle in the header switches
both the UI text and the assistant's response language. All components that render data labels
accept a `lang: "es" | "val"` prop.

## Inline cards

Tool call results are rendered as inline cards when the assistant response includes structured
data. Extraction helpers (`extractAirStations`, `extractValenBisi`, etc.) live in each card
component. Cards are inserted after the message text in the chat bubble.

## Responsive

Mobile breakpoint at 640 px. CSS classes toggled via `globals.css` media queries:
`header-tagline`, `datasets-label`, `new-query-btn`, `suggestions-grid`, `input-footer`,
`sidebar-panel` (hidden on mobile).

## Do not

- Add any data source outside CKAN / Geoportal ArcGIS.
- Add `Co-Authored-By` tags to commits (org rule).
- Commit directly to `develop` or `main`.
- Use work-hours timestamps — commits must fall between 22:00–01:00.
