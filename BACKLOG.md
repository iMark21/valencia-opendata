# valencIA — Backlog

> Concurso Premios Datos Abiertos y Periodismo de Datos València IV  
> Deadline hard: **8 jun 2026** · Buffer: **5 jun 2026**  
> Hoy: 26 may 2026 · Días restantes al buffer: **10**

---

## ✅ Completado

| ID | Tarea | Fecha |
|----|-------|-------|
| VALMCP-01..17 | Tools MCP: aire, ValenBisi, tráfico, EMT, barris, pulse, CKAN, ArcGIS | may 2026 |
| VALMCP-18 | README usuario final + multi-cliente | may 2026 |
| VALMCP-19..24 | CLI local, test harness (142 tests, 32 files), build dist | may 2026 |
| VALMCP-25 | Web demo completo: OpenRouter, geocoder, diseño Senyera, markdown tables | 26 may 2026 |
| VALMCP-26 | Leaflet mini-mapa inline (ValenBisi, EMT, aire) | 26 may 2026 |
| VALMCP-27 | Panel 294 datasets: accordion lateral + chips categoría empty state | 26 may 2026 |
| VALMCP-37 | `AirQualityCard`: badge coloreado (Bona/Acceptable/Dolenta/Molt dolenta) + chips EAQI por contaminante | 26 may 2026 |
| VALMCP-38 | `ValenBisiCard`: número grande bicis + gauge bar available/total + badge muelles | 26 may 2026 |

---

## 📅 Sprint Publicación — por días

### 27 may — Deploy + Mobile ✅

| ID | Tarea | Prioridad |
|----|-------|-----------|
| VALMCP-28 | Deploy web demo en Vercel (conectar repo, env var OPENROUTER_API_KEY) | P0 — movido a publish day (2 jun) |
| VALMCP-29 | ~~Responsive mobile: media queries para input area, bubbles, sidebar bottom-sheet~~ · **completado 27 may** | ✅ |

### 28 may — Packaging npm ✅

| ID | Tarea | Prioridad |
|----|-------|-----------|
| VALMCP-30 | ~~Añadir `"files": ["dist/", "README.md", "LICENSE"]` en package.json~~ · **completado 27 may** | ✅ |
| VALMCP-31 | ~~Crear `LICENSE` (MIT), añadir `"license": "MIT"` y `"repository"` en package.json~~ · **completado 27 may** | ✅ |
| VALMCP-32 | ~~Eliminar `"private": true`, bump versión `0.0.1 → 0.1.0`~~ · **completado 27 may** | ✅ |

### 29 may — README evaluador + CI ✅

| ID | Tarea | Prioridad |
|----|-------|-----------|
| VALMCP-33 | ~~README raíz orientado a evaluador del concurso (sección "Por qué open data", demo link, licencia)~~ · **completado 27 may** | ✅ |
| VALMCP-34 | ~~GitHub Actions CI: `npm test` + `npm run build` en push a develop/main~~ · **completado 27 may** | ✅ |

### 30 may — Repo público + npm publish

| ID | Tarea | Prioridad |
|----|-------|-----------|
| VALMCP-35 | Hacer repo `iMark21/valencia-mcp` público en GitHub | P0 — BLOQUEANTE candidatura |
| VALMCP-36 | `npm publish` (requiere VALMCP-30..32 + VALMCP-35) | P0 |

### 31 may — Cards visuales ✅

| ID | Tarea | Prioridad |
|----|-------|-----------|
| VALMCP-37 | ~~`AirQualityCard`: badge coloreado por umbral OMS~~ · **completado 26 may** | ✅ |
| VALMCP-38 | ~~`ValenBisiCard`: barra gauge `available/total` bicicletas~~ · **completado 26 may** | ✅ |

### 1 jun — Export + Atribución ✅

| ID | Tarea | Prioridad |
|----|-------|-----------|
| VALMCP-39 | ~~Exportar conversación como HTML estático (CC BY 4.0, track periodismo)~~ · **completado 27 may** | ✅ |
| VALMCP-40 | ~~Footer fijo en burbuja asistente: "Fuente: Ajuntament de València, CC BY 4.0"~~ · **completado 27 may** | ✅ |

### 2 jun — Vídeo demo

| ID | Tarea | Prioridad |
|----|-------|-----------|
| VALMCP-41 | Vídeo demo 2-3 min via PitchReel: queries reales, mapa, dataset panel | ~~P1~~ — **NO requerido por bases** (movido a 🧊 backlog) |

### 3 jun — Memoria candidatura ✅

| ID | Tarea | Prioridad |
|----|-------|-----------|
| VALMCP-42 | ~~Redactar memoria de candidatura (descripción técnica, impacto, open data)~~ · **completado 27 may** | ✅ |
| VALMCP-43 | Adjuntos: link repo público, link web demo, link npm — pendiente de publish day (2 jun) | ⏳ |

### 4 jun — Buffer review

| ID | Tarea | Prioridad |
|----|-------|-----------|
| VALMCP-44 | Review final: repo público ✓, npm ✓, web demo live ✓, memoria ✓ | P0 |

### 5 jun — PRESENTACIÓN ⚑

| ID | Tarea | Prioridad |
|----|-------|-----------|
| VALMCP-45 | Cargar solicitud en sede.valencia.es · Procedimiento: **AD.TR.15** | P0 — DEADLINE BUFFER |

---

## 🧊 Backlog (post-concurso o si hay tiempo)

| ID | Tarea |
|----|-------|
| VALMCP-46 | Historial conversación en localStorage |
| VALMCP-47 | Share link (query param en URL) |
| VALMCP-48 | Dark mode (`prefers-color-scheme`) |
| VALMCP-49 | WCAG 2.1 AA accessibility audit |
| VALMCP-50 | Turismo category en dataset panel |
| VALMCP-51 | SSE keep-alive / reconexión automática |

---

_Actualizado: 27 may 2026 (noche) — VALMCP-29..34 + 39/40 + 42 completados; vídeo descartado (no requerido); VALMCP-28/35/36/43/44/45 pendientes publish day_
