import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pregunta a València — Dades Obertes",
  description:
    "Consulta dades en temps real de l'Ajuntament de València: qualitat de l'aire, trànsit, ValenBisi, barris i molt més. Powered by IA.",
  openGraph: {
    title: "Pregunta a València",
    description: "Dades obertes de l'Ajuntament de València a través d'IA",
    siteName: "Pregunta a València",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
