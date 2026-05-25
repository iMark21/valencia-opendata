"use client";

import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import type { MapPoint } from "@/components/MapCard";
import { extractMapPoints } from "@/components/MapCard";
import { extractValenBisiStations } from "@/components/ValenBisiCard";
import { extractAirStations } from "@/components/AirQualityCard";

const MapCard = lazy(() => import("@/components/MapCard"));
const ValenBisiCard = lazy(() => import("@/components/ValenBisiCard"));
const AirQualityCard = lazy(() => import("@/components/AirQualityCard"));

// ─── Types ────────────────────────────────────────────────────────────────────
interface ToolCallState {
  id: string;
  name: string;
  args: Record<string, unknown>;
  summary?: string;
  result?: unknown;
  mapPoints?: MapPoint[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCallState[];
  isStreaming: boolean;
}

type SSEEvent =
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; summary: string }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "answer_chunk"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

type Lang = "es" | "val";

// ─── i18n ─────────────────────────────────────────────────────────────────────
const T = {
  es: {
    placeholder: "Escribe tu consulta…",
    newQuery: "Nueva consulta",
    taglineHero: "Datos en tiempo real · Ayuntamiento de Valencia",
    taglineHeader: "Datos abiertos · Ayuntamiento de Valencia",
    footer: "CC BY 4.0 · Ayuntamiento de Valencia",
    suggestions: [
      { text: "¿Cuál es la calidad del aire en Russafa ahora?", tag: "AIRE" },
      { text: "¿Hay bicis ValenBisi cerca de la Catedral?", tag: "MOVILIDAD" },
      { text: "¿Cómo está el tráfico en el centro?", tag: "TRÁNSIT" },
      { text: "¿Qué barrio tiene mejor calidad ambiental?", tag: "BARRIOS" },
    ],
  },
  val: {
    placeholder: "Escriu la teua consulta…",
    newQuery: "Nova consulta",
    taglineHero: "Dades en temps real · Ajuntament de València",
    taglineHeader: "Dades obertes · Ajuntament de València",
    footer: "CC BY 4.0 · Ajuntament de València",
    suggestions: [
      { text: "Quina és la qualitat de l'aire a Russafa ara?", tag: "AIRE" },
      { text: "Hi ha bicis ValenBisi prop de la Catedral?", tag: "MOBILITAT" },
      { text: "Com està el trànsit al centre?", tag: "TRÀNSIT" },
      { text: "Quin barri té millor qualitat ambiental?", tag: "BARRIS" },
    ],
  },
} as const;

// ─── Constants ────────────────────────────────────────────────────────────────
const MONO = "'Courier New', ui-monospace, 'Cascadia Code', monospace";
const BLUE = "#0050A0";
const RED = "#C8102E";
const YELLOW = "#E6A800";

// ─── Dataset categories ───────────────────────────────────────────────────────
const CATEGORIES = [
  {
    id: "mobilitat",
    label: { es: "MOVILIDAD", val: "MOBILITAT" },
    color: BLUE,
    queries: {
      es: [
        "¿Hay bicis ValenBisi cerca del Mercado Central?",
        "¿Qué autobuses pasan por Ruzafa?",
        "¿Cómo está el tráfico en el centro ahora?",
        "¿Cuál es el estado de todas las estaciones ValenBisi?",
      ],
      val: [
        "Hi ha bicis ValenBisi prop del Mercat Central?",
        "Quins autobusos passen per Ruzafa?",
        "Com està el trànsit al centre ara?",
        "Quin és l'estat de totes les estacions ValenBisi?",
      ],
    },
  },
  {
    id: "ambient",
    label: { es: "MEDI AMBIENT", val: "MEDI AMBIENT" },
    color: "#16a34a",
    queries: {
      es: [
        "¿Cuál es la calidad del aire en Benimaclet ahora?",
        "¿Qué barrio tiene menos contaminación?",
        "¿Cuáles son los niveles de NO₂ en todas las estaciones?",
      ],
      val: [
        "Quina és la qualitat de l'aire a Benimaclet ara?",
        "Quin barri té menys contaminació?",
        "Quins són els nivells de NO₂ a totes les estacions?",
      ],
    },
  },
  {
    id: "barris",
    label: { es: "BARRIOS", val: "BARRIS" },
    color: RED,
    queries: {
      es: [
        "¿Qué barrio tiene mejor calidad ambiental?",
        "Compara la calidad ambiental de Russafa y Campanar",
        "Información sobre el barrio de Cabanyal",
        "¿Cuál es la renta per cápita de Benimaclet?",
      ],
      val: [
        "Quin barri té millor qualitat ambiental?",
        "Compara la qualitat ambiental de Russafa i Campanar",
        "Informació sobre el barri de Cabanyal",
        "Quina és la renda per càpita de Benimaclet?",
      ],
    },
  },
  {
    id: "infraestructura",
    label: { es: "INFRAESTRUCTURA", val: "INFRAESTRUCTURA" },
    color: "#d97706",
    queries: {
      es: [
        "¿Dónde hay aparcamientos públicos en el centro?",
        "¿Qué datasets hay sobre parking en barrios?",
        "¿Hay datos de zonas wifi gratuito?",
      ],
      val: [
        "On hi ha aparcaments públics al centre?",
        "Quins datasets hi ha sobre pàrquing als barris?",
        "Hi ha dades de zones wifi gratuïtes?",
      ],
    },
  },
  {
    id: "geodata",
    label: { es: "GEODATA", val: "GEODATA" },
    color: "#7c3aed",
    queries: {
      es: [
        "¿Qué capas geográficas hay disponibles?",
        "¿Hay datos GeoJSON de límites de barrios?",
        "Muéstrame los servicios del geoportal de Valencia",
      ],
      val: [
        "Quines capes geogràfiques hi ha disponibles?",
        "Hi ha dades GeoJSON de límits de barris?",
        "Mostra'm els serveis del geoportal de València",
      ],
    },
  },
  {
    id: "dades",
    label: { es: "CATÀLEG", val: "CATÀLEG" },
    color: "#0891b2",
    queries: {
      es: [
        "¿Cuántos datasets hay en el catálogo de Valencia?",
        "Busca datasets sobre vulnerabilidad social",
        "¿Qué datos hay disponibles en formato GeoJSON?",
        "¿Hay datos sobre ingresos por hogar?",
      ],
      val: [
        "Quants datasets hi ha al catàleg de València?",
        "Cerca datasets sobre vulnerabilitat social",
        "Quines dades hi ha disponibles en format GeoJSON?",
        "Hi ha dades sobre ingressos per llar?",
      ],
    },
  },
] as const;

const TOOL_META: Record<string, { label: string }> = {
  geocode_address: { label: "geo.code" },
  get_air_quality: { label: "calidad.aire" },
  get_valenbisi_availability: { label: "valenbisi" },
  get_traffic_state: { label: "trànsit" },
  get_neighborhood_info: { label: "barri.info" },
  get_neighborhood_pulse: { label: "barri.pulse" },
  get_emt_stops: { label: "emt.parades" },
  full_text_search: { label: "search" },
  list_datasets: { label: "datasets" },
  get_dataset: { label: "dataset" },
  get_dataset_resource: { label: "resource" },
  find_geo_layers: { label: "geo.layers" },
  query_geo_layer: { label: "geo.query" },
};

// ─── Markdown renderer ────────────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*([^*]+?)\*\*|\*([^*]+?)\*)/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[0].startsWith("**")) {
      parts.push(<strong key={m.index} style={{ fontWeight: 700, color: "#111" }}>{m[2]}</strong>);
    } else {
      parts.push(<em key={m.index} style={{ color: "#555" }}>{m[3]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 0 ? "" : parts.length === 1 ? parts[0] : <>{parts}</>;
}

function renderMarkdown(text: string): React.ReactNode {
  const blocks = text.split(/\n\n+/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (!lines.length) return null;

        // ── Table ────────────────────────────────────────────────────────
        if (
          lines.length >= 2 &&
          /^\|.+\|/.test(lines[0].trim()) &&
          /^\|[\s\-:|]+\|/.test(lines[1].trim())
        ) {
          const parse = (l: string) =>
            l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
          const headers = parse(lines[0]);
          const rows = lines.slice(2).map(parse);
          return (
            <div key={bi} style={{ margin: bi > 0 ? "12px 0 0" : "0", overflowX: "auto", borderRadius: "6px", border: "1px solid rgba(0,80,160,0.12)" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "11.5px" }}>
                <thead>
                  <tr style={{ background: "rgba(0,80,160,0.05)" }}>
                    {headers.map((h, i) => (
                      <th key={i} style={{ textAlign: "left", padding: "7px 12px", borderBottom: "1.5px solid rgba(0,80,160,0.18)", color: BLUE, fontWeight: 700, fontFamily: MONO, fontSize: "9.5px", letterSpacing: "0.6px", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri} style={{ background: ri % 2 === 0 ? "transparent" : "rgba(0,80,160,0.025)", transition: "background 0.1s" }}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ padding: "7px 12px", borderBottom: "1px solid rgba(0,0,0,0.05)", lineHeight: 1.5, fontFamily: MONO, fontSize: "11.5px" }}>
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // ── Heading (## or ###) ──────────────────────────────────────────
        if (lines.length === 1 && /^#{1,3}\s/.test(lines[0].trim())) {
          const level = (lines[0].match(/^#+/) ?? [""])[0].length;
          const content = lines[0].replace(/^#+\s/, "");
          const fs = level === 1 ? "15px" : level === 2 ? "13.5px" : "12.5px";
          return (
            <p key={bi} style={{ margin: bi > 0 ? "14px 0 4px" : "0 0 4px", fontWeight: 700, fontSize: fs, color: "#1A1918", lineHeight: 1.4 }}>
              {renderInline(content)}
            </p>
          );
        }

        // ── List ─────────────────────────────────────────────────────────
        if (lines.every((l) => /^[\*\-]\s/.test(l.trim()))) {
          return (
            <ul key={bi} style={{ margin: bi > 0 ? "10px 0 0" : "0", paddingLeft: "1.3em", lineHeight: 1.8 }}>
              {lines.map((line, li) => (
                <li key={li} style={{ marginBottom: "2px" }}>
                  {renderInline(line.replace(/^[\*\-]\s/, ""))}
                </li>
              ))}
            </ul>
          );
        }

        // ── Paragraph ────────────────────────────────────────────────────
        return (
          <p key={bi} style={{ margin: bi > 0 ? "10px 0 0" : "0", lineHeight: 1.75 }}>
            {lines.map((line, li) => (
              <span key={li}>{li > 0 && <br />}{renderInline(line)}</span>
            ))}
          </p>
        );
      })}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: "8px", height: "8px",
      border: `1.5px solid rgba(230,168,0,0.2)`, borderTopColor: YELLOW,
      borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0,
    }} />
  );
}

function ToolPill({ tool }: { tool: ToolCallState }) {
  const done = tool.summary !== undefined;
  const meta = TOOL_META[tool.name] ?? { label: tool.name };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "2px 8px 2px 6px",
      fontFamily: MONO, fontSize: "10px", fontWeight: 500,
      marginRight: "4px", marginBottom: "3px",
      transition: "all 0.35s",
      background: done ? "rgba(22,163,74,0.07)" : "rgba(230,168,0,0.08)",
      border: `1px solid ${done ? "rgba(22,163,74,0.2)" : "rgba(230,168,0,0.25)"}`,
      color: done ? "#16a34a" : "#A07800",
      borderRadius: "3px",
    }}>
      {done ? <span style={{ fontSize: "8px", fontWeight: 900, color: "#16a34a" }}>✓</span> : <Spinner />}
      <span>{meta.label}</span>
      {done && tool.summary && (
        <span style={{ color: "rgba(22,163,74,0.5)", marginLeft: "2px" }}>
          · {tool.summary}
        </span>
      )}
    </span>
  );
}

function TypingCursor() {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          display: "inline-block", width: "5px", height: "5px", borderRadius: "50%",
          background: "#C8C4BC",
          animation: `bounce-dot 1.2s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [lang, setLang] = useState<Lang>("val");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const t = T[lang];

  const requestGeolocation = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLoading(false);
      },
      () => setGeoLoading(false),
      { timeout: 8000 }
    );
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const adjustHeight = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  };

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const contentWithLocation = userLocation
      ? `[Ubicación del usuario: lat ${userLocation.lat.toFixed(5)}, lng ${userLocation.lng.toFixed(5)}]\n${trimmed}`
      : trimmed;
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: trimmed, toolCalls: [], isStreaming: false };
    const asstId = `a-${Date.now() + 1}`;
    const asstMsg: Message = { id: asstId, role: "assistant", content: "", toolCalls: [], isStreaming: true };

    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setInput("");
    setIsLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const allMsgs = messages.concat(userMsg);
    const payload = allMsgs.map((m, i) =>
      i === allMsgs.length - 1
        ? { role: m.role, content: contentWithLocation }
        : { role: m.role, content: m.content }
    );
    const patch = (fn: (m: Message) => Message) =>
      setMessages((prev) => prev.map((m) => (m.id === asstId ? fn(m) : m)));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          let ev: SSEEvent;
          try { ev = JSON.parse(line.slice(6)) as SSEEvent; } catch { continue; }

          if (ev.type === "tool_start") {
            patch((m) => ({ ...m, toolCalls: [...m.toolCalls, { id: `tc-${ev.name}-${Date.now()}`, name: ev.name, args: ev.args }] }));
          } else if (ev.type === "tool_end") {
            patch((m) => ({ ...m, toolCalls: m.toolCalls.map((tc) => tc.name === ev.name && tc.summary === undefined ? { ...tc, summary: ev.summary } : tc) }));
          } else if (ev.type === "tool_result") {
            const pts = extractMapPoints(ev.name, ev.result);
            patch((m) => ({
              ...m,
              toolCalls: m.toolCalls.map((tc) =>
                tc.name === ev.name && tc.result === undefined
                  ? { ...tc, result: ev.result, mapPoints: pts.length > 0 ? pts : undefined }
                  : tc
              ),
            }));
          } else if (ev.type === "answer_chunk") {
            patch((m) => ({ ...m, content: m.content + ev.text }));
          } else if (ev.type === "done") {
            patch((m) => ({ ...m, isStreaming: false }));
            setIsLoading(false);
          } else if (ev.type === "error") {
            patch((m) => ({ ...m, content: `⚠️ ${ev.message}`, isStreaming: false }));
            setIsLoading(false);
          }
        }
      }
    } catch (err) {
      patch((m) => ({ ...m, content: `⚠️ Error de connexió: ${String(err)}`, isStreaming: false }));
      setIsLoading(false);
    }
  }, [messages, isLoading]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>

      {/* ── Senyera stripe (azul · amarillo · rojo · amarillo · rojo) ────── */}
      <div style={{ height: "3px", display: "flex", flexShrink: 0 }}>
        <div style={{ flex: 1, background: BLUE }} />
        <div style={{ flex: 2, background: YELLOW }} />
        <div style={{ flex: 2, background: RED }} />
        <div style={{ flex: 2, background: YELLOW }} />
        <div style={{ flex: 2, background: RED }} />
      </div>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header style={{ background: "rgba(242,239,233,0.96)", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0, backdropFilter: "blur(8px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px 11px" }}>

          {/* valencIA logotype */}
          <div>
            <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "22px", lineHeight: 1, letterSpacing: "-0.5px" }}>
              <span style={{ fontWeight: 400, color: "#2A2724" }}>valenc</span>
              <span style={{ fontWeight: 700, color: RED, letterSpacing: "-1px" }}>IA</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: "8px", color: "#A8A49E", letterSpacing: "1.8px", textTransform: "uppercase", marginTop: "2px" }}>
              {t.taglineHeader}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>

            {/* Datasets toggle */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              style={{
                fontFamily: MONO, fontSize: "9px", letterSpacing: "0.8px", textTransform: "uppercase",
                padding: "4px 10px", cursor: "pointer",
                background: sidebarOpen ? `rgba(0,80,160,0.1)` : "rgba(255,255,255,0.6)",
                border: `1px solid ${sidebarOpen ? `rgba(0,80,160,0.3)` : "rgba(0,0,0,0.1)"}`,
                color: sidebarOpen ? BLUE : "#A8A49E",
                borderRadius: "4px", fontWeight: sidebarOpen ? 700 : 400,
                transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: "5px",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="1" width="4" height="4" rx="0.5" /><rect x="7" y="1" width="4" height="4" rx="0.5" />
                <rect x="1" y="7" width="4" height="4" rx="0.5" /><rect x="7" y="7" width="4" height="4" rx="0.5" />
              </svg>
              294 datasets
            </button>

            {/* Language toggle */}
            <div style={{ display: "flex", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "4px", overflow: "hidden", background: "rgba(255,255,255,0.6)" }}>
              {(["val", "es"] as Lang[]).map((l, i) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  style={{
                    fontFamily: MONO, fontSize: "9px", letterSpacing: "0.8px", textTransform: "uppercase",
                    padding: "4px 9px", cursor: "pointer", border: "none",
                    borderRight: i === 0 ? "1px solid rgba(0,0,0,0.08)" : "none",
                    background: lang === l ? (l === "val" ? `rgba(0,80,160,0.1)` : "rgba(200,16,46,0.09)") : "transparent",
                    color: lang === l ? (l === "val" ? BLUE : RED) : "#A8A49E",
                    fontWeight: lang === l ? 700 : 400,
                    transition: "all 0.15s",
                  }}
                >
                  {l === "val" ? "VAL" : "ES"}
                </button>
              ))}
            </div>

            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setIsLoading(false); }}
                style={{ fontFamily: MONO, background: "transparent", border: "1px solid rgba(0,0,0,0.1)", color: "#A8A49E", padding: "4px 11px", borderRadius: "4px", fontSize: "10px", cursor: "pointer", letterSpacing: "0.5px", transition: "all 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = RED; e.currentTarget.style.borderColor = `rgba(200,16,46,0.3)`; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#A8A49E"; e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"; }}
              >
                {t.newQuery}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 16px", display: "flex", flexDirection: "column" }}>
        {messages.length === 0 ? (

          /* ── Empty state ──────────────────────────────────────────────── */
          <div className="empty-enter" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}>

            {/* Hero */}
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "clamp(56px, 11vw, 90px)", lineHeight: 1, letterSpacing: "-3px", marginBottom: "14px" }}>
                <span style={{ fontWeight: 300, color: "#3A3530" }}>valenc</span>
                <span style={{ fontWeight: 700, color: RED, letterSpacing: "-4px" }}>IA</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: "10px", color: "#9A9590", letterSpacing: "2.5px", textTransform: "uppercase", marginBottom: "20px" }}>
                {t.taglineHero}
              </div>
              {/* Senyera divider */}
              <div style={{ display: "flex", alignItems: "center", gap: "0", justifyContent: "center", margin: "0 auto", width: "fit-content", overflow: "hidden", borderRadius: "2px" }}>
                <div style={{ width: "36px", height: "3px", background: BLUE }} />
                <div style={{ width: "36px", height: "3px", background: YELLOW }} />
                <div style={{ width: "36px", height: "3px", background: RED }} />
                <div style={{ width: "36px", height: "3px", background: YELLOW }} />
                <div style={{ width: "36px", height: "3px", background: RED }} />
              </div>
              <div style={{ fontFamily: MONO, fontSize: "9px", color: "#B8B4AE", letterSpacing: "2px", marginTop: "12px" }}>
                294 DATASETS OBERTS
              </div>
            </div>

            {/* Suggestion cards */}
            <div style={{ width: "100%", maxWidth: "620px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {t.suggestions.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => sendMessage(s.text)}
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: "10px",
                      padding: "16px 18px",
                      cursor: "pointer",
                      textAlign: "left",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      transition: "box-shadow 0.15s, transform 0.1s, border-color 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.borderColor = "rgba(200,16,46,0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)";
                    }}
                  >
                    <div style={{ fontFamily: MONO, fontSize: "8.5px", color: RED, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "7px", fontWeight: 600 }}>
                      {s.tag}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: "12.5px", lineHeight: 1.5, color: "#3A3530" }}>
                      {s.text}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Category chips + accordion ──────────────────────────── */}
            <div style={{ width: "100%", maxWidth: "620px", marginTop: "24px" }}>
              <div style={{ fontFamily: MONO, fontSize: "8px", color: "#C0BCB6", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px", textAlign: "center" }}>
                o explora por tema
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center", marginBottom: openCategory ? "10px" : "0" }}>
                {CATEGORIES.map((cat) => {
                  const active = openCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setOpenCategory(active ? null : cat.id)}
                      style={{
                        fontFamily: MONO, fontSize: "9px", letterSpacing: "1.2px", textTransform: "uppercase",
                        padding: "4px 10px", cursor: "pointer", borderRadius: "4px",
                        border: `1px solid ${active ? cat.color : "rgba(0,0,0,0.1)"}`,
                        background: active ? `${cat.color}14` : "rgba(255,255,255,0.7)",
                        color: active ? cat.color : "#7A7570",
                        fontWeight: active ? 700 : 400,
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = cat.color; e.currentTarget.style.color = cat.color; } }}
                      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"; e.currentTarget.style.color = "#7A7570"; } }}
                    >
                      {cat.label[lang]}
                    </button>
                  );
                })}
              </div>
              {openCategory && (() => {
                const cat = CATEGORIES.find((c) => c.id === openCategory);
                if (!cat) return null;
                return (
                  <div style={{ background: "#FFFFFF", border: `1px solid ${cat.color}28`, borderLeft: `3px solid ${cat.color}`, borderRadius: "4px 8px 8px 4px", padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {cat.queries[lang].map((q) => (
                      <button
                        key={q}
                        onClick={() => { setOpenCategory(null); sendMessage(q); }}
                        style={{
                          fontFamily: MONO, fontSize: "11.5px", lineHeight: 1.5,
                          padding: "6px 10px", cursor: "pointer",
                          background: "transparent",
                          border: `1px solid ${cat.color}30`,
                          borderRadius: "4px", color: "#3A3530",
                          textAlign: "left", transition: "all 0.12s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `${cat.color}0e`; e.currentTarget.style.borderColor = `${cat.color}60`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = `${cat.color}30`; }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

          </div>

        ) : (

          /* ── Message list ─────────────────────────────────────────────── */
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "740px", margin: "0 auto", width: "100%" }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="msg-enter"
                style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}
              >
                {msg.role === "user" ? (
                  /* User bubble */
                  <div style={{
                    maxWidth: "min(72%, 520px)",
                    padding: "10px 16px",
                    background: "#FFFFFF",
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: "16px 16px 4px 16px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
                    fontFamily: MONO,
                    fontSize: "13.5px",
                    lineHeight: 1.6,
                    color: "#1A1918",
                  }}>
                    {msg.content}
                  </div>
                ) : (
                  /* Assistant card */
                  <div style={{ width: "100%" }}>
                    <div style={{
                      padding: "14px 18px",
                      background: "#FFFFFF",
                      border: "1px solid rgba(0,0,0,0.07)",
                      borderLeft: `3px solid ${BLUE}`,
                      borderRadius: "4px 14px 14px 14px",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                      fontFamily: MONO,
                      fontSize: "13.5px",
                      lineHeight: 1.75,
                      color: "#2A2724",
                    }}>

                      {/* ── Activity log (while tools run, no content yet) ── */}
                      {msg.isStreaming && msg.content === "" && msg.toolCalls.length > 0 && (() => {
                        const allDone = msg.toolCalls.every((tc) => tc.summary !== undefined);
                        return (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "12px" }}>
                              {allDone ? (
                                <>
                                  <TypingCursor />
                                  <span style={{ fontSize: "9px", color: "#A8A49E", letterSpacing: "1.8px", textTransform: "uppercase", marginLeft: "2px" }}>
                                    Generando respuesta
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span style={{ display: "inline-block", width: "5px", height: "5px", background: YELLOW, borderRadius: "50%", animation: "pulse-dot 1.1s ease-in-out infinite" }} />
                                  <span style={{ fontSize: "9px", color: "#A8A49E", letterSpacing: "1.8px", textTransform: "uppercase" }}>
                                    Consultando datos
                                  </span>
                                </>
                              )}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                              {msg.toolCalls.map((tc) => {
                                const done = tc.summary !== undefined;
                                const meta = TOOL_META[tc.name] ?? { label: tc.name };
                                return (
                                  <div key={tc.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px" }}>
                                    <span style={{ width: "14px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                      {done
                                        ? <span style={{ fontSize: "9px", color: "#16a34a", fontWeight: 900 }}>✓</span>
                                        : <Spinner />
                                      }
                                    </span>
                                    <span style={{ fontWeight: 600, color: done ? "#16a34a" : "#7A5E00" }}>{meta.label}</span>
                                    {tc.summary && (
                                      <span style={{ color: "#B8B4AE", fontSize: "10.5px" }}>· {tc.summary}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── Initial typing dots (no tools, no content yet) ── */}
                      {msg.isStreaming && msg.content === "" && msg.toolCalls.length === 0 && (
                        <TypingCursor />
                      )}

                      {/* ── Content (with collapsed source chips on top) ──── */}
                      {msg.content !== "" && (
                        <>
                          {msg.toolCalls.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "12px", paddingBottom: "10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                              {msg.toolCalls.map((tc) => {
                                const meta = TOOL_META[tc.name] ?? { label: tc.name };
                                return (
                                  <span key={tc.id} style={{
                                    fontFamily: MONO, fontSize: "9px",
                                    color: "#16a34a",
                                    background: "rgba(22,163,74,0.07)",
                                    border: "1px solid rgba(22,163,74,0.18)",
                                    borderRadius: "3px",
                                    padding: "1px 7px",
                                    letterSpacing: "0.3px",
                                  }}>
                                    ✓ {meta.label}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {renderMarkdown(msg.content)}
                          {msg.isStreaming && (
                            <span style={{ display: "inline-block", width: "2px", height: "13px", background: RED, opacity: 0.6, marginLeft: "2px", verticalAlign: "middle", animation: "cursor-blink 0.8s ease-in-out infinite" }} />
                          )}
                          {!msg.isStreaming && (() => {
                            const allPoints = msg.toolCalls.flatMap((tc) => tc.mapPoints ?? []);

                            const valenbisiTc = msg.toolCalls.find((tc) => tc.name === "get_valenbisi_availability" && tc.result !== undefined);
                            const valenbisiStations = valenbisiTc ? extractValenBisiStations(valenbisiTc.name, valenbisiTc.result) : null;

                            const airTc = msg.toolCalls.find((tc) => tc.name === "get_air_quality" && tc.result !== undefined);
                            const airStations = airTc ? extractAirStations(airTc.name, airTc.result) : null;

                            if (allPoints.length === 0 && !valenbisiStations && !airStations) return null;
                            return (
                              <>
                                {allPoints.length > 0 && (
                                  <Suspense fallback={<div style={{ height: 220, background: "rgba(0,80,160,0.04)", borderRadius: "8px", marginTop: "12px" }} />}>
                                    <MapCard points={allPoints} />
                                  </Suspense>
                                )}
                                {valenbisiStations && (
                                  <Suspense fallback={null}>
                                    <ValenBisiCard stations={valenbisiStations} />
                                  </Suspense>
                                )}
                                {airStations && (
                                  <Suspense fallback={null}>
                                    <AirQualityCard stations={airStations} />
                                  </Suspense>
                                )}
                              </>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 16px 16px", background: "rgba(242,239,233,0.97)", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0, backdropFilter: "blur(8px)" }}>
        <div style={{ maxWidth: "740px", margin: "0 auto" }}>
          <div style={{
            display: "flex", alignItems: "flex-end", gap: "0",
            background: "#FFFFFF",
            border: `1.5px solid ${focused ? RED : "rgba(0,0,0,0.1)"}`,
            borderRadius: "14px",
            boxShadow: focused ? `0 0 0 3px rgba(200,16,46,0.08)` : "0 1px 4px rgba(0,0,0,0.07)",
            transition: "border-color 0.2s, box-shadow 0.2s",
            overflow: "hidden",
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); adjustHeight(); }}
              onKeyDown={handleKey}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={t.placeholder}
              disabled={isLoading}
              rows={1}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontFamily: MONO, fontSize: "13.5px", lineHeight: 1.6, color: "#1A1918", minHeight: "22px", maxHeight: "140px", padding: "12px 14px", caretColor: RED, opacity: isLoading ? 0.4 : 1 }}
            />

            {/* Geolocation button */}
            <button
              onClick={requestGeolocation}
              disabled={isLoading || geoLoading}
              title={userLocation ? `Ubicación activa (${userLocation.lat.toFixed(3)}, ${userLocation.lng.toFixed(3)})` : "Usar mi ubicación"}
              style={{
                background: "transparent",
                border: "none",
                borderLeft: "1px solid rgba(0,0,0,0.06)",
                color: userLocation ? BLUE : "#C8C4BC",
                width: "40px", minHeight: "48px",
                cursor: isLoading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                transition: "color 0.15s",
                fontSize: "15px",
              }}
              onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.color = BLUE; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = userLocation ? BLUE : "#C8C4BC"; }}
            >
              {geoLoading ? (
                <span style={{ display: "inline-block", width: "10px", height: "10px", border: `1.5px solid rgba(0,80,160,0.2)`, borderTopColor: BLUE, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  {userLocation && <circle cx="12" cy="12" r="6" fill="currentColor" opacity="0.15" />}
                </svg>
              )}
            </button>

            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              style={{
                background: !isLoading && input.trim() ? RED : "transparent",
                border: "none",
                borderLeft: "1px solid rgba(0,0,0,0.06)",
                color: !isLoading && input.trim() ? "#fff" : "#C8C4BC",
                width: "48px", minHeight: "48px",
                cursor: isLoading || !input.trim() ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s, color 0.15s",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { if (!isLoading && input.trim()) e.currentTarget.style.background = "#A80D25"; }}
              onMouseLeave={(e) => { if (!isLoading && input.trim()) e.currentTarget.style.background = RED; }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <p style={{ fontFamily: MONO, textAlign: "center", fontSize: "8.5px", color: "#C0BCB6", margin: "7px 0 0", letterSpacing: "0.8px", textTransform: "uppercase" }}>
            CC BY 4.0 · Ajuntament de València ·{" "}
            <a href="https://opendata.vlci.valencia.es" target="_blank" rel="noopener noreferrer" style={{ color: "#C0BCB6", textDecoration: "none" }}>
              opendata.vlci.valencia.es
            </a>
          </p>
        </div>
      </div>

      {/* ── Datasets sidebar panel ────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)", zIndex: 40, backdropFilter: "blur(1px)" }}
        />
      )}
      <div style={{
        position: "fixed", top: 0, right: 0, height: "100dvh", width: "300px", zIndex: 50,
        background: "#FAFAF8", borderLeft: "1px solid rgba(0,0,0,0.08)",
        boxShadow: sidebarOpen ? "-4px 0 20px rgba(0,0,0,0.08)" : "none",
        transform: sidebarOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        display: "flex", flexDirection: "column",
        overflowY: "auto",
      }}>
        {/* Sidebar header */}
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontFamily: MONO, fontSize: "9px", color: BLUE, letterSpacing: "1.8px", textTransform: "uppercase", fontWeight: 700 }}>
              294 datasets oberts
            </span>
            <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#A8A49E", padding: "2px", lineHeight: 1, fontSize: "16px" }}>×</button>
          </div>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <svg style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", color: "#C0BCB6" }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Buscar tema o query…"
              style={{
                width: "100%", boxSizing: "border-box",
                fontFamily: MONO, fontSize: "11.5px",
                padding: "6px 10px 6px 26px",
                background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "6px",
                outline: "none", color: "#1A1918",
              }}
            />
          </div>
        </div>

        {/* Categories */}
        <div style={{ flex: 1, padding: "8px 0" }}>
          {CATEGORIES.map((cat) => {
            const catLabel = cat.label[lang];
            const queries = cat.queries[lang].filter((q) =>
              !sidebarSearch || q.toLowerCase().includes(sidebarSearch.toLowerCase()) || catLabel.toLowerCase().includes(sidebarSearch.toLowerCase())
            );
            if (sidebarSearch && queries.length === 0) return null;
            const expanded = !sidebarSearch && openCategory === `sb-${cat.id}`;
            return (
              <div key={cat.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                <button
                  onClick={() => !sidebarSearch && setOpenCategory(expanded ? null : `sb-${cat.id}`)}
                  style={{
                    width: "100%", textAlign: "left", padding: "9px 16px",
                    background: "transparent", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.025)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ fontFamily: MONO, fontSize: "9.5px", fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: cat.color }}>
                    {catLabel}
                  </span>
                  {!sidebarSearch && (
                    <span style={{ color: "#C0BCB6", fontSize: "10px", transition: "transform 0.15s", display: "inline-block", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
                  )}
                </button>
                {(expanded || sidebarSearch) && (
                  <div style={{ padding: "0 12px 8px" }}>
                    {queries.map((q) => (
                      <button
                        key={q}
                        onClick={() => { setSidebarOpen(false); setOpenCategory(null); sendMessage(q); }}
                        style={{
                          width: "100%", textAlign: "left", display: "block",
                          fontFamily: MONO, fontSize: "11px", lineHeight: 1.5,
                          padding: "5px 8px", marginBottom: "3px", cursor: "pointer",
                          background: "transparent", border: `1px solid ${cat.color}22`,
                          borderRadius: "4px", color: "#3A3530",
                          transition: "all 0.1s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `${cat.color}0e`; e.currentTarget.style.borderColor = `${cat.color}55`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = `${cat.color}22`; }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar footer */}
        <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
          <p style={{ fontFamily: MONO, fontSize: "8px", color: "#C0BCB6", margin: 0, letterSpacing: "0.8px", lineHeight: 1.6 }}>
            CC BY 4.0 · Ajuntament de València<br />
            <a href="https://opendata.vlci.valencia.es" target="_blank" rel="noopener noreferrer" style={{ color: "#C0BCB6" }}>opendata.vlci.valencia.es</a>
          </p>
        </div>
      </div>
    </div>
  );
}
