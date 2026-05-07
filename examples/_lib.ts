import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

// Shared harness for examples. Connects an in-memory MCP client to the
// local server so the snippets below stay readable. No disk I/O, no
// caching outside the server's in-memory client cache.
export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const server = createServer();
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "valencia-mcp-example", version: "0.0.1" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    const res = await client.callTool({ name, arguments: args });
    const part = (res.content as Array<{ type: string; text?: string }>)[0];
    if (part?.type === "text" && typeof part.text === "string") {
      try {
        return JSON.parse(part.text);
      } catch {
        return part.text;
      }
    }
    return res;
  } finally {
    await client.close();
  }
}

export function dump(label: string, value: unknown): void {
  process.stdout.write(`\n=== ${label} ===\n`);
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}
