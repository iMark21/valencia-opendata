#!/usr/bin/env node
//
// Local CLI for the Valencia MCP. Internal use only — driven through the
// MCP SDK in-memory transport so that tools see the exact same plumbing as
// a remote agent would. No persistence is introduced here either: every
// call recomputes against the live portal (or the test fixtures, when run
// from inside a test).
//
// Usage:
//   valencia-mcp tools                        list registered tools
//   valencia-mcp call <tool> '<json-args>'    invoke a tool, prints stdout
//   valencia-mcp help                         show usage

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server.js";

type Tool = { name: string; description?: string };

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const server = createServer();
  const [s, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "valencia-mcp-cli", version: "0.0.1" },
    { capabilities: {} },
  );
  await Promise.all([server.connect(s), client.connect(c)]);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

function summarize(desc: string | undefined, max: number): string {
  if (!desc) return "";
  const oneLine = desc.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max - 1) + "…";
}

async function listTools(): Promise<void> {
  const tools = await withClient(async (c) => {
    const r = await c.listTools();
    return r.tools as Tool[];
  });
  const nameWidth = Math.max(...tools.map((t) => t.name.length), 4);
  process.stdout.write(
    `${"name".padEnd(nameWidth)}  description\n` +
      `${"-".repeat(nameWidth)}  ${"-".repeat(60)}\n`,
  );
  for (const t of tools) {
    process.stdout.write(
      `${t.name.padEnd(nameWidth)}  ${summarize(t.description, 90)}\n`,
    );
  }
  process.stdout.write(`\n(${tools.length} tools)\n`);
}

async function callTool(name: string, rawArgs: string): Promise<void> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch (err) {
    process.stderr.write(
      `[valencia-mcp] invalid JSON for arguments: ${(err as Error).message}\n`,
    );
    process.exit(2);
  }
  const result = await withClient(async (c) => {
    return await c.callTool({ name, arguments: args });
  });
  const content = (result.content as Array<{ type: string; text?: string }>) ?? [];
  for (const part of content) {
    if (part.type === "text" && typeof part.text === "string") {
      process.stdout.write(part.text + "\n");
    }
  }
  if (result.isError) process.exit(1);
}

function printUsage(): void {
  process.stdout.write(
    [
      "valencia-mcp — local CLI (INTERNAL)",
      "",
      "Usage:",
      "  valencia-mcp tools",
      "  valencia-mcp call <tool> '<json-args>'",
      "  valencia-mcp help",
      "",
      "Examples:",
      "  valencia-mcp tools",
      "  valencia-mcp call get_air_quality '{\"station\":\"centre\"}'",
      "  valencia-mcp call get_neighborhood_pulse '{\"barri\":\"russafa\"}'",
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case undefined:
    case "help":
    case "-h":
    case "--help":
      printUsage();
      return;
    case "tools":
      await listTools();
      return;
    case "call": {
      const [name, json] = rest;
      if (!name) {
        process.stderr.write("[valencia-mcp] missing tool name\n");
        printUsage();
        process.exit(2);
      }
      await callTool(name, json ?? "{}");
      return;
    }
    default:
      process.stderr.write(`[valencia-mcp] unknown command: ${cmd}\n`);
      printUsage();
      process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(`[valencia-mcp] fatal: ${String(err?.stack ?? err)}\n`);
  process.exit(1);
});
