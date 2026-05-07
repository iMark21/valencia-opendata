import { describe, it, expect, vi } from "vitest";
import { ArcgisClient } from "../src/clients/arcgis.js";
import { ArcgisError } from "../src/types/arcgis.js";

function fakeFetch(
  responder: (url: string) => {
    status?: number;
    body: string;
    contentType?: string;
  },
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const { status = 200, body, contentType = "application/json" } = responder(
      url,
    );
    return new Response(body, {
      status,
      headers: { "Content-Type": contentType },
    });
  }) as unknown as typeof fetch;
}

describe("ArcgisClient", () => {
  describe("AC1 + AC5: methods, base URL, no auth", () => {
    it("exposes queryLayer/listServices/serviceInfo/layerInfo and points to geoportal.valencia.es", () => {
      const client = new ArcgisClient();
      expect(client.baseURL).toBe(
        "https://geoportal.valencia.es/server/rest/services/",
      );
      expect(typeof client.queryLayer).toBe("function");
      expect(typeof client.listServices).toBe("function");
      expect(typeof client.serviceInfo).toBe("function");
      expect(typeof client.layerInfo).toBe("function");
    });

    it("never sends Authorization or token=", async () => {
      const fetchImpl = fakeFetch(() => ({
        body: JSON.stringify({ features: [] }),
      }));
      const client = new ArcgisClient({ fetchImpl });
      await client.queryLayer("OPENDATA/Trafico", 0);
      const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const url = String(call?.[0]);
      const headers = (call?.[1] as RequestInit | undefined)?.headers as
        | Record<string, string>
        | undefined;
      expect(url).not.toMatch(/[?&]token=/);
      expect(headers?.Authorization).toBeUndefined();
    });
  });

  describe("AC2: response parser normalizes geometry", () => {
    it("normalizes points and rings to GeoJSON-like", async () => {
      const fetchImpl = fakeFetch(() => ({
        body: JSON.stringify({
          features: [
            {
              attributes: { id: 1, name: "estación" },
              geometry: { x: -0.37, y: 39.47 },
            },
            {
              attributes: { id: 2 },
              geometry: {
                rings: [
                  [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 0],
                  ],
                ],
              },
            },
          ],
          spatialReference: { wkid: 4326 },
          exceededTransferLimit: false,
        }),
      }));
      const client = new ArcgisClient({ fetchImpl });
      const r = await client.queryLayer("OPENDATA/Trafico", 0);

      expect(r.count).toBe(2);
      expect(r.features[0]?.geometry).toEqual({
        type: "Point",
        coordinates: [-0.37, 39.47],
      });
      expect(r.features[1]?.geometry).toEqual({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      });
      expect(r.spatialReference).toEqual({ wkid: 4326 });
    });
  });

  describe("AC3: in-memory cache", () => {
    it("returns cached query within TTL", async () => {
      const fetchImpl = fakeFetch(() => ({
        body: JSON.stringify({ features: [] }),
      }));
      const client = new ArcgisClient({ fetchImpl });
      await client.queryLayer("OPENDATA/Trafico", 0, { where: "1=1" });
      await client.queryLayer("OPENDATA/Trafico", 0, { where: "1=1" });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("treats different params as distinct cache keys", async () => {
      const fetchImpl = fakeFetch(() => ({
        body: JSON.stringify({ features: [] }),
      }));
      const client = new ArcgisClient({ fetchImpl });
      await client.queryLayer("OPENDATA/Trafico", 0, { where: "id=1" });
      await client.queryLayer("OPENDATA/Trafico", 0, { where: "id=2" });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
  });

  describe("AC4: errors", () => {
    it("throws ArcgisError with httpStatus + sample on 500", async () => {
      const fetchImpl = fakeFetch(() => ({
        status: 500,
        body: "Internal Server Error",
      }));
      const client = new ArcgisClient({ fetchImpl });
      try {
        await client.queryLayer("OPENDATA/Missing", 99);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ArcgisError);
        const e = err as ArcgisError;
        expect(e.httpStatus).toBe(500);
        expect(e.serviceName).toBe("OPENDATA/Missing");
        expect(e.layerId).toBe(99);
        expect(e.sample).toContain("Internal Server Error");
      }
    });

    it("throws ArcgisError when response is HTML (not JSON)", async () => {
      const fetchImpl = fakeFetch(() => ({
        body: "<html><body>404</body></html>",
        contentType: "text/html",
      }));
      const client = new ArcgisClient({ fetchImpl });
      await expect(
        client.queryLayer("OPENDATA/x", 0),
      ).rejects.toBeInstanceOf(ArcgisError);
    });

    it("throws ArcgisError when ArcGIS returns {error: ...} envelope", async () => {
      const fetchImpl = fakeFetch(() => ({
        body: JSON.stringify({
          error: { code: 400, message: "Invalid layer" },
        }),
      }));
      const client = new ArcgisClient({ fetchImpl });
      await expect(
        client.queryLayer("OPENDATA/x", 99),
      ).rejects.toMatchObject({
        name: "ArcgisError",
        message: expect.stringContaining("Invalid layer"),
      });
    });
  });

  describe("AC6: exceededTransferLimit surfaced", () => {
    it("propagates exceededTransferLimit and feature count", async () => {
      const fetchImpl = fakeFetch(() => ({
        body: JSON.stringify({
          features: Array.from({ length: 1000 }).map((_, i) => ({
            attributes: { id: i },
            geometry: { x: 0, y: 0 },
          })),
          exceededTransferLimit: true,
        }),
      }));
      const client = new ArcgisClient({ fetchImpl });
      const r = await client.queryLayer("OPENDATA/Trafico", 0);
      expect(r.count).toBe(1000);
      expect(r.exceededTransferLimit).toBe(true);
    });
  });
});
