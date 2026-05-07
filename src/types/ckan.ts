// Subset of CKAN action API response shapes used by the client.
// Only the fields we currently consume are typed; the rest is preserved as
// unknown so we don't silently drop or misrepresent upstream data.

export type CkanEnvelope<T> = {
  success: boolean;
  result?: T;
  error?: { __type?: string; message?: string } | string;
  help?: string;
};

export type CkanResource = {
  id: string;
  package_id?: string;
  name?: string;
  description?: string;
  format?: string;
  url: string;
  size?: number | null;
  mimetype?: string | null;
  last_modified?: string | null;
  created?: string | null;
  hash?: string | null;
  state?: string;
  // additional fields preserved
  [key: string]: unknown;
};

export type CkanPackage = {
  id: string;
  name: string;
  title?: string;
  notes?: string;
  organization?: { id: string; name: string; title?: string } | null;
  groups?: Array<{ id: string; name: string; title?: string }>;
  tags?: Array<{ id: string; name: string; display_name?: string }>;
  resources: CkanResource[];
  metadata_created?: string;
  metadata_modified?: string;
  license_id?: string;
  license_title?: string;
  state?: string;
  [key: string]: unknown;
};

export type CkanGroup = {
  id: string;
  name: string;
  title?: string;
  description?: string;
  display_name?: string;
  package_count?: number;
  [key: string]: unknown;
};

export type CkanPackageSearchResult = {
  count: number;
  results: CkanPackage[];
  facets?: Record<string, unknown>;
  search_facets?: Record<string, unknown>;
};

export type PackageSearchOptions = {
  rows?: number;
  start?: number;
  sort?: string;
  fq?: string;
};

export class CkanError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CkanError";
    this.code = code;
  }
}
