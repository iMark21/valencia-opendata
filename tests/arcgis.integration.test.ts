import { describe, it, expect } from "vitest";
import { ArcgisClient } from "../src/clients/arcgis.js";


// Service path verified live (2026-05-08): OPENDATA folder hosts 6 MapServers
// — MedioAmbiente, Salud, SociedadBienestar, Trafico, Turismo,
// UrbanismoEInfraestructuras. No auth.
describe("ArcgisClient — integration (live geoportal)", () => {
  it("listServices('OPENDATA') returns the 6 known MapServers", async () => {
    const client = new ArcgisClient();
    const listing = await client.listServices("OPENDATA");
    const names = (listing.services ?? []).map((s) => s.name);
    for (const expected of [
      "OPENDATA/MedioAmbiente",
      "OPENDATA/Trafico",
      "OPENDATA/Turismo",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("serviceInfo returns layers for OPENDATA/Trafico", async () => {
    const client = new ArcgisClient();
    const info = await client.serviceInfo("OPENDATA/Trafico");
    expect(info.layers).toBeDefined();
    expect((info.layers ?? []).length).toBeGreaterThan(0);
  });
});
