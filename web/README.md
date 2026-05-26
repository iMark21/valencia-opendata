# valencIA — web demo

Interfaz de chat Next.js para el servidor MCP `valencia-opendata`. Consume los 294 datasets abiertos del Ayuntamiento de València en tiempo real vía OpenRouter.

## Requisitos

- Node.js ≥ 20
- Clave de API de [OpenRouter](https://openrouter.ai) con créditos activos
- El paquete MCP compilado: `cd .. && npm run build`

## Arrancar en local

```sh
# Desde la raíz del monorepo:
npm install && npm run build

# Desde web/:
cd web
npm install
cp .env.example .env.local          # añade tu OPENROUTER_API_KEY
npm run dev                          # http://localhost:3000
```

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `OPENROUTER_API_KEY` | **Obligatoria.** Clave de OpenRouter para el LLM. |

## Estructura

```
web/
├── app/
│   ├── api/chat/route.ts   # SSE endpoint: LLM + tool calls MCP
│   ├── page.tsx            # UI completa del chat
│   └── globals.css         # Estilos globales + responsive
├── components/
│   ├── AirQualityCard.tsx  # Card inline calidad del aire (EAQI)
│   ├── ValenBisiCard.tsx   # Card inline disponibilidad ValenBisi
│   └── MapCard.tsx         # Mini-mapa Leaflet inline
└── lib/
    ├── mcp-bridge.ts       # Conecta Next.js con el MCP (InMemoryTransport)
    ├── geocoder.ts         # Geocodificación Nominatim
    ├── openrouter-tools.ts # Definición de tools para OpenRouter
    └── types.ts
```

## Arquitectura

El API route `/api/chat` instancia el servidor MCP directamente en proceso (sin subprocess ni red local) usando `InMemoryTransport` del SDK de MCP. Cada tool call va directo al portal CKAN o al Geoportal ArcGIS.

```
Browser → SSE → /api/chat → mcp-bridge (InMemoryTransport) → CKAN / Geoportal
```

## Datos

Solo se consumen fuentes oficiales del Ayuntamiento de València bajo CC BY 4.0:
- Portal CKAN: `opendata.vlci.valencia.es`
- Geoportal ArcGIS: `geoportal.valencia.es`
