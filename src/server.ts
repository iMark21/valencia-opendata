#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "valencia-opendata",
    version: "0.0.1",
    description:
      "City of València open data portal exposed live to AI agents. " +
      "Routes CKAN catalog and ArcGIS Geoportal queries; never persists data. " +
      "Scope: municipal term of València only. CC BY 4.0 — attribution included in every response.",
  });

  registerAllTools(server);

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isEntrypoint = import.meta.url === `file://${process.argv[1]}`;
if (isEntrypoint) {
  main().catch((err) => {
    process.stderr.write(`[valencia-opendata] fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
