export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type SSEEvent =
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; summary: string }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "answer_chunk"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };
