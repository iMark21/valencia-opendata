import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import "./globals.css";

const raleway = Raleway({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://valencia-mcp.vercel.app"),
  title: "Pregunta a València — Dades Obertes",
  description:
    "Consulta dades en temps real de l'Ajuntament de València: qualitat de l'aire, trànsit, ValenBisi, barris i molt més. Powered by IA.",
  openGraph: {
    title: "valencIA — Pregunta a les dades obertes de València",
    description:
      "294 datasets oberts de l'Ajuntament de València a través d'IA. Qualitat de l'aire, trànsit, ValenBisi, barris i molt més.",
    siteName: "valencIA",
    type: "website",
    locale: "ca_ES",
  },
  twitter: {
    card: "summary_large_image",
    title: "valencIA — Pregunta a les dades obertes de València",
    description:
      "294 datasets oberts de l'Ajuntament de València a través d'IA. Qualitat de l'aire, trànsit, ValenBisi i molt més.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`h-full ${raleway.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
