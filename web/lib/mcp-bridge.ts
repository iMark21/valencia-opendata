import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "@mcp/dist/server.js";

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const server = createServer();
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "valencia-web", version: "0.1.0" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({ name, arguments: args });
    const parts = res.content as Array<{ type: string; text?: string }>;
    const first = parts[0];
    if (first?.type === "text" && typeof first.text === "string") {
      try {
        return JSON.parse(first.text);
      } catch {
        return first.text;
      }
    }
    return res;
  } finally {
    await client.close();
  }
}
