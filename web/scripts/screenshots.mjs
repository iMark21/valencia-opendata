// Captura screenshots reales de la web demo usando Chrome del sistema.
//
// Asume: `npm run dev` corriendo en http://localhost:3000.
// Salida: web/public/screenshots/*.png

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "screenshots");
const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";

const SHOTS = [
  { name: "hero",      width: 1280, height: 900,  q: null,                                                 lang: "val", waitMs: 1200,  fullPage: false },
  { name: "query-map", width: 1280, height: 1400, q: "Hi ha bicis ValenBisi prop del Mercat Central?",     lang: "val", waitMs: 60000, fullPage: true },
  { name: "card-air",  width: 1280, height: 1400, q: "Quina és la qualitat de l'aire a Russafa ara?",      lang: "val", waitMs: 60000, fullPage: true },
];

// Oculta el badge "N" del indicador de dev mode de Next.js
const HIDE_DEV_BADGE = `
  [data-nextjs-dev-tools-button],
  [data-nextjs-toast],
  nextjs-portal { display: none !important; }
`;

async function waitForResponse(page, timeoutMs) {
  // El streaming termina cuando aparece la atribución "Fuente: Ajuntament" en la última burbuja
  // o cuando desaparece el cursor parpadeante. Espera lo que ocurra antes.
  try {
    await page.waitForFunction(
      () => {
        const cards = document.querySelectorAll('[class*="msg-enter"]');
        if (cards.length === 0) return false;
        const last = cards[cards.length - 1];
        const text = last.textContent || "";
        return text.includes("Fuente:") || text.includes("Font:");
      },
      { timeout: timeoutMs },
    );
  } catch {
    console.warn("  ⚠ timeout esperando respuesta — capturando estado actual");
  }
  // Pequeño settle para que terminen las animaciones
  await page.waitForTimeout(800);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`→ Lanzando Chrome del sistema contra ${BASE}`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });

  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 2,
      locale: shot.lang === "val" ? "ca-ES" : "es-ES",
    });
    const page = await context.newPage();

    const url = shot.q
      ? `${BASE}/?q=${encodeURIComponent(shot.q)}&lang=${shot.lang}`
      : `${BASE}/?lang=${shot.lang}`;

    console.log(`→ ${shot.name}: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.addStyleTag({ content: HIDE_DEV_BADGE });

    if (shot.q) {
      await waitForResponse(page, shot.waitMs);
    } else {
      await page.waitForTimeout(shot.waitMs);
    }

    // Scrollea al top y oculta de nuevo (por si el DOM se re-pintó tras streaming)
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.addStyleTag({ content: HIDE_DEV_BADGE });
    await page.waitForTimeout(400);

    const file = join(OUT_DIR, `${shot.name}.png`);
    await page.screenshot({ path: file, fullPage: shot.fullPage });
    console.log(`  ✓ ${file}`);

    await context.close();
  }

  await browser.close();
  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
