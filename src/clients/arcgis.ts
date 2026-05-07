import { Cache } from "../cache.js";
import {
  ArcgisError,
  ArcgisGeometry,
  ArcgisLayerInfo,
  ArcgisServiceInfo,
  ArcgisServiceListing,
  GeoFeature,
  QueryLayerOptions,
  QueryLayerResult,
} from "../types/arcgis.js";

const DEFAULT_BASE_URL =
  "https://geoportal.valencia.es/server/rest/services/";
const DEFAULT_USER_AGENT = "valencia-opendata-mcp/0.0.1 (private dev)";
const DEFAULT_TTL_SECONDS = 60;
const SAMPLE_BYTES = 200;

// ArcGIS service names are folder paths (e.g. "OPENDATA/MOVILIDAD"). Each
// segment must be URL-encoded individually so that the slash separator is
// preserved verbatim instead of becoming "%2F".
function encodeServicePath(name: string): string {
  return name
    .split("/")
    .filter((seg) => seg.length > 0)
    .map(encodeURIComponent)
    .join("/");
}

export type ArcgisClientOptions = {
  baseURL?: string;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  cache?: Cache<unknown>;
  defaultTtlSeconds?: number;
};

export class ArcgisClient {
  readonly baseURL: string;
  readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cache: Cache<unknown>;
  private readonly defaultTtl: number;

  constructor(opts: ArcgisClientOptions = {}) {
    this.baseURL = opts.baseURL ?? DEFAULT_BASE_URL;
    this.userAgent =
      opts.userAgent ?? process.env.VLC_MCP_UA ?? DEFAULT_USER_AGENT;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.cache = opts.cache ?? new Cache<unknown>();
    this.defaultTtl = opts.defaultTtlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  async queryLayer(
    serviceName: string,
    layerId: number,
    opts: QueryLayerOptions = {},
  ): Promise<QueryLayerResult> {
    const params: Record<string, string> = {
      f: opts.f ?? "json",
      where: opts.where ?? "1=1",
      outFields:
        opts.outFields === undefined
          ? "*"
          : Array.isArray(opts.outFields)
            ? opts.outFields.join(",")
            : opts.outFields,
      returnGeometry: String(opts.returnGeometry ?? true),
    };
    if (opts.geometry !== undefined)
      params.geometry =
        typeof opts.geometry === "string"
          ? opts.geometry
          : JSON.stringify(opts.geometry);
    if (opts.geometryType) params.geometryType = opts.geometryType;
    if (opts.spatialRel) params.spatialRel = opts.spatialRel;
    if (opts.resultRecordCount !== undefined)
      params.resultRecordCount = String(opts.resultRecordCount);
    if (opts.resultOffset !== undefined)
      params.resultOffset = String(opts.resultOffset);

    const path = `${encodeServicePath(serviceName)}/MapServer/${layerId}/query`;
    const raw = await this.call<Record<string, unknown>>(
      path,
      params,
      opts.ttlSeconds ?? this.defaultTtl,
      { serviceName, layerId },
    );
    return this.parseQueryResponse(raw);
  }

  listServices(folder?: string): Promise<ArcgisServiceListing> {
    const path = folder ? `${encodeServicePath(folder)}/` : "";
    return this.call<ArcgisServiceListing>(path, { f: "json" }, this.defaultTtl);
  }

  serviceInfo(serviceName: string): Promise<ArcgisServiceInfo> {
    const path = `${encodeServicePath(serviceName)}/MapServer`;
    return this.call<ArcgisServiceInfo>(
      path,
      { f: "json" },
      this.defaultTtl,
      { serviceName },
    );
  }

  layerInfo(serviceName: string, layerId: number): Promise<ArcgisLayerInfo> {
    const path = `${encodeServicePath(serviceName)}/MapServer/${layerId}`;
    return this.call<ArcgisLayerInfo>(
      path,
      { f: "json" },
      this.defaultTtl,
      { serviceName, layerId },
    );
  }

  private async call<T>(
    path: string,
    params: Record<string, string>,
    ttlSeconds: number,
    ctx: { serviceName?: string; layerId?: number } = {},
  ): Promise<T> {
    const url = this.buildUrl(path, params);
    const cached = this.cache.get(url) as T | undefined;
    if (cached !== undefined) return cached;

    const response = await this.fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": this.userAgent,
      },
    });

    const text = await response.text();

    if (!response.ok) {
      throw new ArcgisError({
        message: `ArcGIS ${path} HTTP ${response.status}`,
        httpStatus: response.status,
        sample: text.slice(0, SAMPLE_BYTES),
        ...ctx,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ArcgisError({
        message: `ArcGIS ${path} returned non-JSON (likely HTML error page)`,
        httpStatus: response.status,
        sample: text.slice(0, SAMPLE_BYTES),
        ...ctx,
      });
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      (parsed as { error?: unknown }).error
    ) {
      const err = (parsed as { error: { code?: number; message?: string } })
        .error;
      throw new ArcgisError({
        message: `ArcGIS ${path} error: ${err.message ?? "unknown"}`,
        httpStatus: response.status,
        sample: text.slice(0, SAMPLE_BYTES),
        ...ctx,
      });
    }

    this.cache.set(url, parsed, ttlSeconds);
    return parsed as T;
  }

  private buildUrl(path: string, params: Record<string, string>): string {
    const base = this.baseURL.endsWith("/")
      ? this.baseURL
      : `${this.baseURL}/`;
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return url.toString();
  }

  private parseQueryResponse(raw: Record<string, unknown>): QueryLayerResult {
    const features = Array.isArray(raw.features)
      ? (raw.features as Array<Record<string, unknown>>).map((f) =>
          this.normalizeFeature(f),
        )
      : [];
    return {
      features,
      count: features.length,
      exceededTransferLimit: raw.exceededTransferLimit === true,
      spatialReference:
        (raw.spatialReference as QueryLayerResult["spatialReference"]) ?? null,
    };
  }

  private normalizeFeature(f: Record<string, unknown>): GeoFeature {
    const attributes =
      typeof f.attributes === "object" && f.attributes !== null
        ? (f.attributes as Record<string, unknown>)
        : {};
    const geometry = this.normalizeGeometry(f.geometry);
    return { attributes, geometry };
  }

  private normalizeGeometry(g: unknown): ArcgisGeometry {
    if (!g || typeof g !== "object") return null;
    const obj = g as Record<string, unknown>;

    if (typeof obj.x === "number" && typeof obj.y === "number") {
      return { type: "Point", coordinates: [obj.x, obj.y] };
    }
    if (Array.isArray(obj.paths) && obj.paths.length > 0) {
      const path = obj.paths[0] as Array<[number, number]>;
      return { type: "LineString", coordinates: path };
    }
    if (Array.isArray(obj.rings)) {
      const rings = obj.rings as Array<Array<[number, number]>>;
      if (rings.length === 1) {
        return { type: "Polygon", coordinates: rings };
      }
      return {
        type: "MultiPolygon",
        coordinates: rings.map((r) => [r]),
      };
    }
    return null;
  }
}

export { ArcgisError } from "../types/arcgis.js";
