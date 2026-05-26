import OpenAI from "openai";
import { callTool } from "@/lib/mcp-bridge";
import { geocodeAddress } from "@/lib/geocoder";
import { OR_TOOLS } from "@/lib/openrouter-tools";
import type { ChatMessage, SSEEvent } from "@/lib/types";

const SYSTEM_PROMPT = `Eres un asistente de datos abiertos del Ayuntamiento de València.
Tienes acceso a datos en tiempo real: calidad del aire, ValenBisi, tráfico, paradas EMT, barrios y el catálogo completo de 294 datasets.
Responde siempre en el mismo idioma que usa el usuario (español o valenciano).
Usa las herramientas disponibles para responder con datos reales y actuales.
Cuando uses datos, menciona brevemente la fuente (Ajuntament de València, CC BY 4.0).
Sé conciso y útil.

REGLAS DE USO DE HERRAMIENTAS:
1. Si el usuario menciona un lugar o dirección que no está en tu lista de coordenadas conocidas,
   llama primero a "geocode_address" para obtener las coordenadas y luego úsalas con la tool correspondiente.
2. Si el usuario pregunta de forma general sin ubicación específica (ej. "autobuses en Valencia",
   "todas las estaciones ValenBisi"), llama la herramienta SIN parámetro "near" y con limit 20-30.
3. Solo pide ubicación si el usuario quiere resultados muy cercanos a un punto que no puedas geocodificar.
4. Para preguntas sobre qué barrio tiene mejor/peor calidad ambiental o rankings comparativos,
   llama "get_neighborhood_pulse" para cada uno de estos barrios EN SECUENCIA (una llamada por barrio):
   Russafa, Benimaclet, Campanar, Patraix, Cabanyal, El Carmen, Rascanya, Mestalla.
   Luego presenta una tabla ordenada por pulse_score de mayor a menor. Nunca inventes el ranking.
5. Para tráfico: usa scope "tramos" para estado general de vías; "intensity" para métricas numéricas
   de densidad; "cameras" solo si el usuario pregunta por cámaras. Combina siempre con "near"
   cuando el usuario mencione un lugar concreto.

COORDENADAS CONOCIDAS (usa directamente, sin llamar geocode_address):
- Mercado de Colón: lat 39.4699, lng -0.3763
- Mercado Central: lat 39.4734, lng -0.3793
- Catedral de València: lat 39.4752, lng -0.3751
- Ciudad de las Artes y las Ciencias: lat 39.4540, lng -0.3536
- La Malvarrosa (playa): lat 39.4789, lng -0.3230
- Estació del Nord: lat 39.4654, lng -0.3771
- Palau de la Música: lat 39.4774, lng -0.3727
- Torres de Serrans: lat 39.4780, lng -0.3784
- El Carmen (barrio): lat 39.4763, lng -0.3802
- Russafa (barrio): lat 39.4628, lng -0.3740
- Benimaclet (barrio): lat 39.4840, lng -0.3608
- Campanar (barrio): lat 39.4851, lng -0.3936
- Patraix (barrio): lat 39.4561, lng -0.3904
- Jardins de Turia: lat 39.4756, lng -0.3730
- Estadio / barrio Mestalla: lat 39.4747, lng -0.3584
- Puerto de Valencia: lat 39.4542, lng -0.3270
- Aeropuerto de Valencia: lat 39.4893, lng -0.4816
- Cabanyal (barrio): lat 39.4726, lng -0.3291
- Rascanya (barrio): lat 39.4906, lng -0.3680
- Albufera de València: lat 39.3310, lng -0.3530`;

// Models to try in order on quota/rate errors
const MODELS = [
  "openai/gpt-oss-120b:free",                  // Primary: fast, reliable tool calling
  "openrouter/owl-alpha",                       // Fallback: OpenRouter native, 1M ctx
  "meta-llama/llama-3.3-70b-instruct:free",    // Last resort: Llama 3.3
];

const MAX_TOOL_ROUNDS = 8;

const SPATIAL_TOOLS = new Set([
  "get_valenbisi_availability",
  "get_emt_stops",
  "get_air_quality",
  "get_traffic_state",
]);

function emit(controller: ReadableStreamDefaultController, event: SSEEvent): void {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

function toolSummary(name: string, result: unknown): string {
  if (!result || typeof result !== "object") return String(result).slice(0, 80);
  const r = result as Record<string, unknown>;
  if (name === "geocode_address") {
    if ("error" in r) return "No encontrada";
    const geo = r as { display_name?: string };
    return geo.display_name ? geo.display_name.split(",").slice(0, 2).join(",") : "Encontrada";
  }
  if (name === "get_air_quality" && Array.isArray(r.stations)) {
    return `${(r.stations as unknown[]).length} estaciones devueltas`;
  }
  if (name === "get_valenbisi_availability" && Array.isArray(r.stations)) {
    return `${(r.stations as unknown[]).length} estaciones ValenBisi`;
  }
  if (name === "get_traffic_state") {
    const total = ["tramos", "intensity", "cameras"]
      .map((k) => (Array.isArray(r[k]) ? (r[k] as unknown[]).length : 0))
      .reduce((a, b) => a + b, 0);
    return `${total} elementos de tráfico`;
  }
  if (name === "get_emt_stops" && Array.isArray(r.stops)) {
    return `${(r.stops as unknown[]).length} paradas EMT`;
  }
  if (name === "get_neighborhood_pulse" && r.pulse_score !== undefined) {
    return `Pulse score: ${r.pulse_score}/100`;
  }
  if ((name === "list_datasets" || name === "full_text_search") && Array.isArray(r.results)) {
    return `${(r.results as unknown[]).length} datasets encontrados`;
  }
  if (name === "get_neighborhood_info" && r.barri) return `Barrio: ${r.barri}`;
  return "Datos obtenidos";
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY no configurada" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let messages: ChatMessage[];
  try {
    const body = await req.json() as { messages?: unknown };
    if (!Array.isArray(body.messages)) throw new Error("invalid");
    messages = body.messages as ChatMessage[];
  } catch {
    return new Response(JSON.stringify({ error: "Body inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: "Sin mensajes" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const geocodeCache = new Map<string, unknown>();

      try {
        const client = new OpenAI({
          baseURL: "https://openrouter.ai/api/v1",
          apiKey,
          defaultHeaders: {
            "HTTP-Referer": "https://valencia-mcp.vercel.app",
            "X-Title": "valencIA - Dades Obertes",
          },
        });

        // Build OpenAI messages array
        const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];

        let modelIndex = 0;
        let round = 0;

        while (round < MAX_TOOL_ROUNDS) {
          // Try models in order on quota errors
          let completion: OpenAI.Chat.Completions.ChatCompletion | null = null;
          while (modelIndex < MODELS.length) {
            try {
              completion = await client.chat.completions.create({
                model: MODELS[modelIndex]!,
                messages: chatMessages,
                tools: OR_TOOLS,
                tool_choice: "auto",
              }, { timeout: 30_000 });
              break;
            } catch (err) {
              const msg = String(err);
              if ((msg.includes("429") || msg.includes("quota") || msg.includes("rate")) && modelIndex < MODELS.length - 1) {
                modelIndex++;
                continue;
              }
              throw err;
            }
          }

          if (!completion) throw new Error("No model available");

          const choice = completion.choices[0];
          if (!choice) break;

          const { message } = choice;
          chatMessages.push(message);

          // No tool calls — emit final answer
          if (!message.tool_calls || message.tool_calls.length === 0) {
            emit(controller, { type: "answer_chunk", text: message.content ?? "" });
            break;
          }

          // Execute tool calls (standard function calls only)
          for (const tc of message.tool_calls) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fn = (tc as any).function as { name: string; arguments: string } | undefined;
            if (!fn) continue;
            const name = fn.name;
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(fn.arguments) as Record<string, unknown>; } catch { /* empty args */ }

            emit(controller, { type: "tool_start", name, args });

            let toolResult: unknown;
            try {
              if (name === "geocode_address") {
                const cacheKey = ((args.query as string) ?? "").toLowerCase().trim();
                if (geocodeCache.has(cacheKey)) {
                  toolResult = geocodeCache.get(cacheKey);
                } else {
                  toolResult = await geocodeAddress((args.query as string) ?? "") ?? { error: "No se encontró la dirección" };
                  geocodeCache.set(cacheKey, toolResult);
                }
              } else {
                toolResult = await callTool(name, args);
              }
            } catch (err) {
              toolResult = { error: String(err) };
            }

            emit(controller, { type: "tool_end", name, summary: toolSummary(name, toolResult) });

            if (SPATIAL_TOOLS.has(name)) {
              emit(controller, { type: "tool_result", name, result: toolResult });
            }

            chatMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify(toolResult),
            });
          }

          round++;
        }

        if (round >= MAX_TOOL_ROUNDS) {
          emit(controller, { type: "answer_chunk", text: "He consultado los datos disponibles. Por favor, reformula tu pregunta." });
        }

        emit(controller, { type: "done" });
      } catch (err) {
        emit(controller, { type: "error", message: String(err) });
        emit(controller, { type: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
