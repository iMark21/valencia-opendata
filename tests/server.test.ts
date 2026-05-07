import { describe, it, expect } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createServer } from "../src/server.js";

describe("MCP server bootstrap", () => {
  it("server identifies itself as valencia-opendata v0.0.1 and registers no tools yet", async () => {
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

    // No tools registered yet (Sprint 0). The server therefore does not
    // advertise a `tools` capability — that's the correct shape for the
    // bootstrap milestone.
    const caps = client.getServerCapabilities();
    expect(caps?.tools).toBeUndefined();

    await client.close();
  });
});
