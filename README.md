# valencia-opendata (MCP)

> ⚠️ **INTERNAL — DO NOT PUBLISH.** Fase 1 R&D del proyecto Valencia MCP.
> `package.json` mantiene `"private": true`. Cualquier apertura pública
> es Fase 2 y vive en `ai-workspace/services/rnd/projects/valencia-mcp/`.

Servidor Model Context Protocol que expone los 294 datasets del portal de
datos abiertos del Ayuntamiento de València (CKAN + Geoportal ArcGIS) a
agentes AI mediante consumo en vivo.

## Invariantes

- **Live only.** Cada llamada a una tool resuelve a una llamada upstream.
- **In-memory cache only.** TTLs cortos. Sin disco, sin DB, sin snapshots.
- **Para datos pesados:** se devuelve URL + schema + frescura, nunca el contenido.
- **Sin auth** (CC BY 4.0, sin API keys).

## Scripts

- `npm run dev` — arranca el server vía stdio (`tsx`).
- `npm run cli -- tools` — lista las 11 tools registradas.
- `npm run cli -- call <tool> '<json>'` — invoca una tool y vuelca a stdout.
- `npm run example -- examples/<file>.ts` — atajo `tsx` para los ejemplos.
- `npm run build` — compila a `dist/`.
- `npm test` — vitest (replay sin red).
- `npm run record` — regraba fixtures contra los portales live.
- `npm run typecheck` / `npm run lint`.

## CLI local

Sin acoplarse a un cliente Claude/MCP, el CLI usa el SDK MCP en
in-memory transport:

```
$ npm run cli -- tools
$ npm run cli -- call get_air_quality '{"station":"centre"}'
$ npm run cli -- call get_neighborhood_pulse '{"barri":"russafa"}'
```

Tras `npm run build`, los binarios `valencia-opendata` (server stdio) y
`valencia-mcp` (CLI) quedan en `dist/`.

## Ejemplos

Cuatro scripts didácticos en `examples/`. Imprimen a stdout, **no escriben
a disco** (refleja la postura del MCP también desde fuera):

- `01-discover.ts` — `list_datasets` + `find_geo_layers`.
- `02-pulse-russafa.ts` — `get_neighborhood_pulse` con score compuesto.
- `03-air-now.ts` — `get_air_quality` + history pointer.
- `04-near-me.ts` — `get_valenbisi_availability` + `get_air_quality({near})`.

## Spec

Plan, stories y AC en `ai-workspace/services/rnd/projects/valencia-mcp/`.
