import { Cache } from "../cache.js";
import {
  CkanEnvelope,
  CkanError,
  CkanPackage,
  CkanPackageSearchResult,
  CkanResource,
  PackageSearchOptions,
} from "../types/ckan.js";

const DEFAULT_BASE_URL = "https://opendata.vlci.valencia.es/api/3/action/";
const DEFAULT_USER_AGENT = "valencia-opendata-mcp/0.0.1 (private dev)";

export type CkanClientOptions = {
  baseURL?: string;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  cache?: Cache<unknown>;
  ttl?: {
    packageList?: number;
    packageShow?: number;
    packageSearch?: number;
    resourceShow?: number;
    groupList?: number;
  };
};

const DEFAULT_TTL = {
  packageList: 300,
  packageShow: 300,
  packageSearch: 60,
  resourceShow: 300,
  groupList: 300,
} as const;

export class CkanClient {
  readonly baseURL: string;
  readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cache: Cache<unknown>;
  private readonly ttl: Required<NonNullable<CkanClientOptions["ttl"]>>;

  constructor(opts: CkanClientOptions = {}) {
    this.baseURL = opts.baseURL ?? DEFAULT_BASE_URL;
    this.userAgent =
      opts.userAgent ?? process.env.VLC_MCP_UA ?? DEFAULT_USER_AGENT;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.cache = opts.cache ?? new Cache<unknown>();
    this.ttl = { ...DEFAULT_TTL, ...(opts.ttl ?? {}) };
  }

  packageList(): Promise<string[]> {
    return this.call<string[]>("package_list", {}, this.ttl.packageList);
  }

  packageShow(id: string): Promise<CkanPackage> {
    return this.call<CkanPackage>(
      "package_show",
      { id },
      this.ttl.packageShow,
    );
  }

  packageSearch(
    q: string,
    opts: PackageSearchOptions = {},
  ): Promise<CkanPackageSearchResult> {
    const params: Record<string, string | number> = { q };
    if (opts.rows !== undefined) params.rows = opts.rows;
    if (opts.start !== undefined) params.start = opts.start;
    if (opts.sort !== undefined) params.sort = opts.sort;
    if (opts.fq !== undefined) params.fq = opts.fq;
    return this.call<CkanPackageSearchResult>(
      "package_search",
      params,
      this.ttl.packageSearch,
    );
  }

  resourceShow(id: string): Promise<CkanResource> {
    return this.call<CkanResource>(
      "resource_show",
      { id },
      this.ttl.resourceShow,
    );
  }

  groupList(): Promise<string[]> {
    return this.call<string[]>("group_list", {}, this.ttl.groupList);
  }

  private async call<T>(
    action: string,
    params: Record<string, string | number>,
    ttlSeconds: number,
  ): Promise<T> {
    const url = this.buildUrl(action, params);
    const cacheKey = url;
    const cached = this.cache.get(cacheKey) as T | undefined;
    if (cached !== undefined) return cached;

    const response = await this.fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": this.userAgent,
      },
    });

    if (!response.ok) {
      throw new CkanError(
        "http_error",
        `CKAN ${action} returned HTTP ${response.status} ${response.statusText}`,
      );
    }

    const envelope = (await response.json()) as CkanEnvelope<T>;

    if (!envelope.success) {
      const code =
        typeof envelope.error === "object" && envelope.error?.__type
          ? envelope.error.__type
          : "ckan_error";
      const message =
        typeof envelope.error === "object"
          ? (envelope.error?.message ?? JSON.stringify(envelope.error))
          : (envelope.error ?? "Unknown CKAN error");
      throw new CkanError(code, message);
    }

    if (envelope.result === undefined) {
      throw new CkanError(
        "ckan_empty_result",
        `CKAN ${action} returned success without result`,
      );
    }

    this.cache.set(cacheKey, envelope.result, ttlSeconds);
    return envelope.result;
  }

  private buildUrl(
    action: string,
    params: Record<string, string | number>,
  ): string {
    const url = new URL(action, this.baseURL);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    return url.toString();
  }
}

export { CkanError } from "../types/ckan.js";
