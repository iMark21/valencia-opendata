"use client";

import { useEffect, useRef, memo } from "react";

export interface MapPoint {
  lat: number;
  lng: number;
  label: string;
  detail?: string;
  type: "valenbisi" | "emt" | "air" | "traffic";
}

const ICONS: Record<MapPoint["type"], string> = {
  valenbisi: "🚲",
  emt: "🚌",
  air: "🌬️",
  traffic: "🚗",
};

export function extractMapPoints(name: string, result: unknown): MapPoint[] {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;

  if (name === "get_valenbisi_availability" && Array.isArray(r.stations)) {
    return (r.stations as Record<string, unknown>[])
      .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
      .map((s) => ({
        lat: s.lat as number,
        lng: s.lng as number,
        label: String(s.name ?? s.id ?? ""),
        detail: `🚲 ${s.bikes_available ?? "?"} disponibles · 🅿️ ${s.docks_free ?? "?"} libres`,
        type: "valenbisi",
      }));
  }

  if (name === "get_emt_stops" && Array.isArray(r.stops)) {
    return (r.stops as Record<string, unknown>[])
      .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
      .map((s) => ({
        lat: s.lat as number,
        lng: s.lng as number,
        label: String(s.name ?? s.id ?? ""),
        detail: Array.isArray(s.lines) ? `Líneas: ${(s.lines as string[]).join(", ")}` : undefined,
        type: "emt",
      }));
  }

  if (name === "get_air_quality" && Array.isArray(r.stations)) {
    return (r.stations as Record<string, unknown>[])
      .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
      .map((s) => ({
        lat: s.lat as number,
        lng: s.lng as number,
        label: String(s.name ?? ""),
        detail: undefined,
        type: "air",
      }));
  }

  return [];
}

interface MapCardProps {
  points: MapPoint[];
  height?: number;
}

function MapCardInner({ points, height = 220 }: MapCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  // Stable key — only changes when actual coordinates change, not on array re-allocation
  const pointsKey = points
    .map((p) => `${p.lat},${p.lng},${p.type},${p.label},${p.detail ?? ""}`)
    .join("|");

  useEffect(() => {
    const pts = points;
    if (!containerRef.current || pts.length === 0) return;

    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      // Fix default icon paths broken by webpack/turbopack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current, { scrollWheelZoom: false, zoomControl: true });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>',
        maxZoom: 18,
      }).addTo(map);

      const latLngs: [number, number][] = [];

      for (const p of pts) {
        latLngs.push([p.lat, p.lng]);
        const icon = L.divIcon({
          html: `<span style="font-size:18px;line-height:1;display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35))">${ICONS[p.type]}</span>`,
          className: "",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          popupAnchor: [0, -12],
        });
        L.marker([p.lat, p.lng], { icon })
          .bindPopup(
            `<div style="font-family:ui-monospace,'Courier New',monospace;font-size:11px;line-height:1.5">` +
            `<strong style="color:#1A1918">${p.label}</strong>` +
            (p.detail ? `<br><span style="color:#6B6560">${p.detail}</span>` : "") +
            `</div>`,
            { maxWidth: 220 }
          )
          .addTo(map);
      }

      if (latLngs.length === 1) {
        map.setView(latLngs[0], 15);
      } else {
        map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24], maxZoom: 16 });
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // pointsKey is a stable string derived from coordinates — won't change on array re-allocation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  if (points.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{
        height,
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid rgba(0,0,0,0.08)",
        marginTop: "12px",
        background: "#e8e0d8",
      }}
    />
  );
}

export default memo(MapCardInner);
