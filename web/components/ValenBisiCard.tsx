"use client";

const MONO = "'Courier New', ui-monospace, 'Cascadia Code', monospace";

export type ValenBisiStation = {
  id: number | null;
  name: string;
  address?: string | null;
  bikes_available: number | null;
  docks_free: number | null;
  bikes_total: number | null;
  status: string;
  distance_m?: number;
};

export function extractValenBisiStations(name: string, result: unknown): ValenBisiStation[] | null {
  if (name !== "get_valenbisi_availability" || !result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (!Array.isArray(r.stations) || r.stations.length === 0) return null;
  return r.stations as ValenBisiStation[];
}

function bikeColor(available: number | null): string {
  if (available === null) return "#9CA3AF";
  if (available >= 5) return "#16a34a";
  if (available >= 1) return "#d97706";
  return "#dc2626";
}

function GaugeBar({ available, total }: { available: number | null; total: number | null }) {
  if (available === null || total === null || total === 0) return null;
  const pct = Math.round((available / total) * 100);
  const color = bikeColor(available);
  return (
    <div style={{ marginTop: "7px" }}>
      <div style={{ height: "3px", background: "rgba(0,0,0,0.07)", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "2px" }} />
      </div>
    </div>
  );
}

export default function ValenBisiCard({ stations }: { stations: ValenBisiStation[] }) {
  return (
    <div style={{ marginTop: "14px" }}>
      <div style={{ fontFamily: MONO, fontSize: "8px", color: "#6B6560", letterSpacing: "1.8px", textTransform: "uppercase", marginBottom: "8px" }}>
        ValenBisi · Disponibilitat en temps real
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(145px, 1fr))", gap: "8px" }}>
        {stations.slice(0, 12).map((s, i) => {
          const color = bikeColor(s.bikes_available);
          return (
            <div key={i} style={{
              background: "#FAFAF8",
              border: "1px solid rgba(0,0,0,0.07)",
              borderTop: `2.5px solid ${color}`,
              borderRadius: "6px",
              padding: "10px 12px",
            }}>
              <div style={{
                fontFamily: MONO, fontSize: "10px", fontWeight: 600,
                color: "#3A3530", lineHeight: 1.3, marginBottom: "7px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }} title={s.name}>
                {s.name}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "3px" }}>
                <span style={{ fontFamily: MONO, fontSize: "24px", fontWeight: 700, color, lineHeight: 1 }}>
                  {s.bikes_available ?? "—"}
                </span>
                <span style={{ fontFamily: MONO, fontSize: "10px", color: "#5A5550", paddingBottom: "1px" }} aria-hidden="true">🚲</span>
              </div>
              <GaugeBar available={s.bikes_available} total={s.bikes_total} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                {s.docks_free !== null && (
                  <span style={{ fontFamily: MONO, fontSize: "9px", color: "#5A5550" }}>
                    <span aria-hidden="true">🅿️ </span>{s.docks_free}
                    <span className="sr-only"> espacios libres</span>
                  </span>
                )}
                {s.distance_m !== undefined && (
                  <span style={{ fontFamily: MONO, fontSize: "9px", color: "#6B6560", marginLeft: "auto" }}>
                    {s.distance_m < 1000 ? `${s.distance_m}m` : `${(s.distance_m / 1000).toFixed(1)}km`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
