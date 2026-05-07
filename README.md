# valencia-mcp

> Asistente AI para los datos abiertos del Ayuntamiento de València.
> Conecta cualquier cliente MCP (Claude Desktop, Cursor, Continue.dev,
> VS Code…) al portal municipal y deja que el modelo conteste con datos
> reales: calidad del aire, ValenBisi, tráfico, EMT, barris, catálogo.

> ⚠️ **Estado: privado · Fase 1 R&D.** Repo no publicado en npm todavía.
> La candidatura al premio Valencia IV vive en
> `ai-workspace/services/rnd/projects/valencia-mcp/`.

---

## Qué es

`valencia-mcp` es un servidor [Model Context Protocol](https://modelcontextprotocol.io)
que expone los **294 datasets** del portal de datos abiertos del Ayuntamiento
de València (CKAN + Geoportal ArcGIS) como tools que cualquier agente AI
puede invocar en lenguaje natural.

- **12 tools** — 6 genéricas (catálogo, search, query ArcGIS) + 6 curadas
  (aire, ValenBisi, tráfico, barris, pulse ambiental, EMT).
- **Live only.** Cada llamada resuelve a una llamada upstream. Nada se
  almacena en disco.
- **Solo open data oficial.** CKAN `opendata.vlci.valencia.es` + Geoportal
  `geoportal.valencia.es`, ambos bajo CC BY 4.0. No se scrapean webs
  municipales aunque sean públicas.

---

## Qué puedes preguntarle

Ejemplos reales que el modelo resuelve invocando una o varias tools:

**Calidad del aire**
- "¿Qué calidad del aire hay ahora en Russafa?"
- "Dame el NO₂ de la estación Centro y compáralo con el límite de la OMS."
- "Estación de aire más cercana a la Universidad Politécnica."

**Movilidad — ValenBisi · EMT · tráfico**
- "¿Cuántos ValenBisi libres hay cerca de la Plaça de l'Ajuntament?"
- "¿Qué buses pasan por la parada 2105? ¿Y cerca de la Estación del Norte?"
- "Dame todas las paradas de la línea N1 (nocturna)."
- "Estado del tráfico ahora mismo en el centro: tramos, intensidad y
   cámaras."

**Barris y pulso ambiental**
- "Dime todo lo que sepas del barri Russafa: distrito, área, polígono."
- "Compara el pulse ambiental de Russafa vs Ciutat Vella."
- "Qué espacios verdes hay en El Carme y cuántos m² suman."

**Descubrimiento del catálogo**
- "¿Hay datos abiertos sobre Fallas? ¿Y sobre vivienda pública?"
- "Lista los datasets de movilidad y dame los formatos de cada uno."
- "Capas ArcGIS disponibles en `OPENDATA/Trafico`."

---

## Las 12 tools

| Tool | Qué resuelve | Fuente |
|------|--------------|--------|
| `list_datasets` | Catálogo CKAN con filtros (theme, format, organization) | CKAN |
| `get_dataset` | Metadata + resources + capas ArcGIS relacionadas | CKAN |
| `get_dataset_resource` | URL + schema + frescura (no descarga bytes) | CKAN |
| `query_geo_layer` | Query ArcGIS-style sobre cualquier capa Geoportal | Geoportal |
| `find_geo_layers` | Descubrimiento de servicios/capas del Geoportal | Geoportal |
| `full_text_search` | Búsqueda full-text scored sobre los 294 datasets | CKAN |
| `get_air_quality` | NO₂/PM10/PM2.5/O₃ live de las 11 estaciones RVVCCA | Geoportal layer 156 |
| `get_valenbisi_availability` | Bicis y huecos por estación, filtro por proximidad | Geoportal layer 228 |
| `get_traffic_state` | Tramos, intensidad y cámaras (multi-scope) | Geoportal `OPENDATA/Trafico` |
| `get_neighborhood_info` | Geometría, distrito, área y vulnerabilidad pointer | Geoportal layer 224 + CKAN |
| `get_neighborhood_pulse` | Score 0-100 compuesto (aire+verde+ruido+vuln) | Orquesta varias capas |
| `get_emt_stops` | Paradas EMT con líneas y URL de próximas llegadas | Geoportal layer 226 |

Cada respuesta incluye `attribution` y la URL exacta de la fuente.

---

## Instalación

### Hoy — Fase 1 (privado, instalación local)

```sh
git clone git@github.com:iMark21/valencia-mcp.git
cd valencia-mcp
npm install
npm run build
```

Tras `build`, los binarios quedan en `dist/`:

- `dist/server.js` — server MCP por **stdio** (lanzable desde Claude/Cursor/etc.)
- `dist/cli.js` — CLI local para probar tools sin cliente AI.

### Fase 2 — pendiente

Cuando se publique en npm bastará:

```sh
npx -y valencia-mcp           # ejecución directa, sin clone
```

(En curso: pulir packaging, semver `0.1.0`, LICENSE.)

---

## Configuración por cliente MCP

### Claude Desktop

Edita `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) o el equivalente en Windows/Linux:

```json
{
  "mcpServers": {
    "valencia": {
      "command": "node",
      "args": ["/RUTA/ABSOLUTA/A/valencia-mcp/dist/server.js"]
    }
  }
}
```

Reinicia Claude Desktop con **Cmd+Q** y reábrelo. Aparecerá `valencia LOCAL DEV`.

### Cursor

`~/.cursor/mcp.json` (o desde `Settings → MCP`):

```json
{
  "mcpServers": {
    "valencia": {
      "command": "node",
      "args": ["/RUTA/ABSOLUTA/A/valencia-mcp/dist/server.js"]
    }
  }
}
```

### Continue.dev / VS Code

En `~/.continue/config.json` añade dentro de `experimental.modelContextProtocolServers`:

```json
{
  "transport": {
    "type": "stdio",
    "command": "node",
    "args": ["/RUTA/ABSOLUTA/A/valencia-mcp/dist/server.js"]
  }
}
```

### Cualquier cliente MCP por stdio

El protocolo es el estándar del proyecto MCP. Si tu cliente acepta un
**comando + args** para servidores stdio:

- **command:** `node`
- **args:** `["/RUTA/ABSOLUTA/A/valencia-mcp/dist/server.js"]`

Cuando se publique en npm, todos los snippets de arriba se simplifican a
`command: "npx", args: ["-y", "valencia-mcp"]`.

---

## Invariantes

- **Live only.** Cada tool resuelve a una llamada upstream contra CKAN o
  Geoportal. Sin caché en disco, sin DB, sin snapshots.
- **In-memory cache only.** TTLs cortos (30 s a 1 h según volatilidad del
  dato). El cache muere con el proceso.
- **Pointer, no bytes.** Para datos pesados (CSVs históricos de aire,
  GTFS, vulnerabilidad) la tool devuelve URL + tamaño + frescura. El
  cliente decide si descarga.
- **Solo CKAN + Geoportal.** CC BY 4.0 declarada en ambos. No se aceptan
  scrapers de webs municipales aunque sean públicas — debilitarían la
  trazabilidad jurídica del concurso Valencia IV.
- **Sin auth.** El portal no requiere API keys.

---

## Para developers

```sh
npm test               # vitest, replay sin red, ~1.3s, 142 tests
npm run record         # regraba fixtures contra los portales live
npm run typecheck
npm run lint
npm run cli -- tools                                  # lista las 12 tools
npm run cli -- call get_air_quality '{"station":"centre"}'
npm run example -- examples/02-pulse-russafa.ts       # tsx live
```

Los tests funcionan en modo **record/replay**: `npm test` lee fixtures
versionados (`tests/fixtures/`) y no toca la red. `npm run record`
regraba contra los portales live cuando algo cambia upstream.

Más detalles arquitectónicos, decisiones técnicas y backlog en
`ai-workspace/services/rnd/projects/valencia-mcp/`.

## Atribución

Datos: Ajuntament de València · CC BY 4.0 ·
[opendata.vlci.valencia.es](https://opendata.vlci.valencia.es) ·
[geoportal.valencia.es](https://geoportal.valencia.es)
