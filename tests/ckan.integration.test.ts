import { describe, it, expect } from "vitest";
import { CkanClient } from "../src/clients/ckan.js";

const integration = process.env.INTEGRATION === "1";

describe.skipIf(!integration)("CkanClient — integration (live portal)", () => {
  it("packageList returns a non-empty list of dataset names from València", async () => {
    const client = new CkanClient();
    const list = await client.packageList();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    expect(typeof list[0]).toBe("string");
  });
});
