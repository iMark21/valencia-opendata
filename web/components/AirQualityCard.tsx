"use client";

const MONO = "'Courier New', ui-monospace, 'Cascadia Code', monospace";
const SANS = "var(--font-sans), 'Raleway', system-ui, -apple-system, 'Segoe UI', sans-serif";

type Reading = {
  pollutant: string;
  value: number;
  unit: string;
};

type AirStation = {
  name: string;
  air_quality_label?: string | null;
  readings: Reading[];
};

export function extractAirStations(name: string, result: unknown): AirStation[] | null {
  if (name !== "get_air_quality" || !result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (!Array.isArray(r.stations) || r.stations.length === 0) return null;
  return r.stations as AirStation[];
}

// Simplified EAQI hourly thresholds: [fair, poor, bad] in µg/m³ (CO in mg/m³)
const THRESHOLDS: Record<string, [number, number, number]> = {
  no2:  [40,  100, 200],
  pm10: [20,  50,  100],
  pm25: [10,  25,  50],
  o3:   [60,  120, 180],
  so2:  [100, 200, 350],
  co:   [4,   10,  20],
};

const LEVELS = {
  good: { bg: "rgba(22,163,74,0.09)",  border: "rgba(22,163,74,0.22)",  text: "#16a34a" },
  fair: { bg: "rgba(217,119,6,0.09)",  border: "rgba(217,119,6,0.22)",  text: "#d97706" },
  poor: { bg: "rgba(234,88,12,0.09)",  border: "rgba(234,88,12,0.22)",  text: "#ea580c" },
  bad:  { bg: "rgba(220,38,38,0.09)",  border: "rgba(220,38,38,0.22)",  text: "#dc2626" },
  n_a:  { bg: "rgba(0,0,0,0.04)",      border: "rgba(0,0,0,0.09)",      text: "#5A5550" },
} as const;

type Level = keyof typeof LEVELS;

function level(pollutant: string, value: number): Level {
  const t = THRESHOLDS[pollutant.toLowerCase()];
  if (!t) return "n_a";
  if (value < t[0]) return "good";
  if (value < t[1]) return "fair";
  if (value < t[2]) return "poor";
  return "bad";
}

const LABELS: Record<string, string> = {
  no2: "NO₂", pm10: "PM10", pm25: "PM2.5", o3: "O₃", so2: "SO₂", co: "CO",
};

const LEVEL_LABEL: Record<"es" | "val", Record<Level, string>> = {
  val: { good: "Bona",   fair: "Acceptable", poor: "Dolenta",  bad: "Molt dolenta", n_a: "—" },
  es:  { good: "Buena",  fair: "Aceptable",  poor: "Deficiente", bad: "Muy deficiente", n_a: "—" },
};

function overallLevel(readings: Reading[]): Level {
  const order: Level[] = ["good", "fair", "poor", "bad"];
  let worst: Level = "good";
  for (const r of readings) {
    const l = level(r.pollutant, r.value);
    if (l === "n_a") continue;
    if (order.indexOf(l) > order.indexOf(worst)) worst = l;
  }
  return worst;
}

export default function AirQualityCard({ stations, lang = "val" }: { stations: AirStation[]; lang?: "es" | "val" }) {
  const labels = LEVEL_LABEL[lang];
  const header = lang === "val" ? "Qualitat de l’aire · RVVCCA" : "Calidad del aire · RVVCCA";
  const noData = lang === "val" ? "Sense lectures disponibles" : "Sin lecturas disponibles";
  return (
    <div style={{ marginTop: "14px" }}>
      <div style={{ fontFamily: MONO, fontSize: "10.5px", color: "#4A453F", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px", fontWeight: 600 }}>
        {header}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {stations.map((s, i) => {
          const overall = s.readings.length > 0 ? overallLevel(s.readings) : "n_a";
          const c = LEVELS[overall];
          return (
            <div key={i} style={{
              background: "#FAFAF8",
              border: "1px solid rgba(0,0,0,0.07)",
              borderLeft: `3px solid ${c.border}`,
              borderRadius: "4px 8px 8px 4px",
              padding: "10px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontFamily: SANS, fontSize: "14.5px", fontWeight: 700, color: "#1A1918" }}>
                  {s.name}
                </span>
                <span style={{
                  fontFamily: SANS, fontSize: "11.5px", fontWeight: 600,
                  padding: "3px 9px", borderRadius: "4px",
                  background: c.bg, border: `1px solid ${c.border}`, color: c.text,
                  whiteSpace: "nowrap",
                }}>
                  {labels[overall]}
                </span>
              </div>
              {s.readings.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                  {s.readings.map((r, ri) => {
                    const lv = level(r.pollutant, r.value);
                    const rc = LEVELS[lv];
                    return (
                      <span key={ri} style={{
                        fontFamily: MONO, fontSize: "12px", fontWeight: 700,
                        padding: "4px 9px", borderRadius: "4px",
                        background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text,
                        letterSpacing: "0.2px",
                      }}>
                        {LABELS[r.pollutant] ?? r.pollutant.toUpperCase()} {r.value} <span style={{ fontWeight: 500, opacity: 0.85 }}>{r.unit}</span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <span style={{ fontFamily: SANS, fontSize: "13px", color: "#4A453F" }}>{noData}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
