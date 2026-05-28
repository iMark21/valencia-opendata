import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "valencIA — Pregunta a les dades obertes de l'Ajuntament de València";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#F2EFE9",
        }}
      >
        {/* Senyera top stripe */}
        <div style={{ display: "flex", height: "10px", flexShrink: 0 }}>
          <div style={{ flex: 1, backgroundColor: "#0050A0" }} />
          <div style={{ flex: 2, backgroundColor: "#E6A800" }} />
          <div style={{ flex: 2, backgroundColor: "#C8102E" }} />
          <div style={{ flex: 2, backgroundColor: "#E6A800" }} />
          <div style={{ flex: 2, backgroundColor: "#C8102E" }} />
        </div>

        {/* Main */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: "60px 80px",
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              fontSize: "128px",
              lineHeight: 1,
              letterSpacing: "-4px",
              marginBottom: "28px",
              fontFamily: "Georgia, serif",
            }}
          >
            <span style={{ color: "#2A2724", fontWeight: 300 }}>valenc</span>
            <span style={{ color: "#C8102E", fontWeight: 700, letterSpacing: "-10px" }}>IA</span>
          </div>

          {/* Senyera divider */}
          <div
            style={{
              display: "flex",
              width: "220px",
              height: "5px",
              borderRadius: "3px",
              overflow: "hidden",
              marginBottom: "28px",
            }}
          >
            <div style={{ flex: 1, backgroundColor: "#0050A0" }} />
            <div style={{ flex: 2, backgroundColor: "#E6A800" }} />
            <div style={{ flex: 2, backgroundColor: "#C8102E" }} />
            <div style={{ flex: 2, backgroundColor: "#E6A800" }} />
            <div style={{ flex: 2, backgroundColor: "#C8102E" }} />
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: "26px",
              color: "#5A5550",
              letterSpacing: "4px",
              textTransform: "uppercase",
              fontFamily: "monospace",
              marginBottom: "20px",
              textAlign: "center",
            }}
          >
            DADES OBERTES · AJUNTAMENT DE VALÈNCIA
          </div>

          {/* Dataset count */}
          <div
            style={{
              fontSize: "18px",
              color: "#8A857F",
              letterSpacing: "3px",
              fontFamily: "monospace",
              textTransform: "uppercase",
            }}
          >
            294 datasets oberts · CC BY 4.0
          </div>
        </div>

        {/* Senyera bottom stripe */}
        <div style={{ display: "flex", height: "6px", flexShrink: 0 }}>
          <div style={{ flex: 1, backgroundColor: "#0050A0" }} />
          <div style={{ flex: 2, backgroundColor: "#E6A800" }} />
          <div style={{ flex: 2, backgroundColor: "#C8102E" }} />
          <div style={{ flex: 2, backgroundColor: "#E6A800" }} />
          <div style={{ flex: 2, backgroundColor: "#C8102E" }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
