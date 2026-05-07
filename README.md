# valencia-opendata (MCP)

**Estado:** PRIVADO · Fase 1 R&D.

Servidor Model Context Protocol que expone los 294 datasets del portal de datos abiertos del Ayuntamiento de València (CKAN + Geoportal ArcGIS) a agentes AI mediante consumo en vivo.

## Invariantes

- **Live only.** Cada llamada a una tool resuelve a una llamada upstream.
- **In-memory cache only.** TTLs cortos. Sin disco, sin DB, sin snapshots.
- **Para datos pesados:** se devuelve URL + schema + frescura, nunca el contenido.
- **Sin auth** (CC BY 4.0, sin API keys).

## Scripts

- `npm run dev` — arranca el server vía stdio (`tsx`).
- `npm run build` — compila a `dist/`.
- `npm test` — vitest.
- `npm run typecheck` — tsc sin emisión.
- `npm run lint` — eslint.

## Spec

Plan, stories y AC en `ai-workspace/services/rnd/projects/valencia-mcp/`.
