import { describe, it, expect } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createServer } from "../src/server.js";

describe("MCP server bootstrap", () => {
  it("server identifies itself as valencia-opendata v0.0.1 and advertises registered tools", async () => {
    const server = createServer();
    const [serverTransport, clientTransport] =
      InMemoryTransport.createLinkedPair();

    const client = new Client(
      { name: "test-client", version: "0.0.0" },
      { capabilities: {} },
    );

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const info = client.getServerVersion();
    expect(info?.name).toBe("valencia-opendata");
    expect(info?.version).toBe("0.0.1");

    const caps = client.getServerCapabilities();
    expect(caps?.tools).toBeDefined();

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("list_datasets");

    await client.close();
  });
});
