// Subset of ArcGIS REST response shapes used by the client.

export type ArcgisGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: Array<[number, number]> }
  | {
      type: "Polygon";
      coordinates: Array<Array<[number, number]>>;
    }
  | { type: "MultiPolygon"; coordinates: Array<Array<Array<[number, number]>>> }
  | null;

export type GeoFeature = {
  attributes: Record<string, unknown>;
  geometry: ArcgisGeometry;
};

export type QueryLayerResult = {
  features: GeoFeature[];
  count: number;
  exceededTransferLimit: boolean;
  spatialReference: { wkid?: number; latestWkid?: number } | null;
};

export type QueryLayerOptions = {
  where?: string;
  outFields?: string | string[];
  geometry?: unknown;
  geometryType?:
    | "esriGeometryPoint"
    | "esriGeometryEnvelope"
    | "esriGeometryPolygon"
    | "esriGeometryPolyline";
  spatialRel?:
    | "esriSpatialRelIntersects"
    | "esriSpatialRelContains"
    | "esriSpatialRelWithin";
  returnGeometry?: boolean;
  f?: "json" | "geojson" | "pjson";
  resultRecordCount?: number;
  resultOffset?: number;
  ttlSeconds?: number;
};

export type ArcgisServiceListing = {
  currentVersion?: number;
  folders?: string[];
  services?: Array<{ name: string; type: string }>;
};

export type ArcgisServiceInfo = {
  serviceDescription?: string;
  layers?: Array<{
    id: number;
    name: string;
    type?: string;
    geometryType?: string;
    minScale?: number;
    maxScale?: number;
  }>;
  tables?: Array<{ id: number; name: string }>;
  spatialReference?: { wkid?: number; latestWkid?: number };
};

export type ArcgisLayerInfo = {
  id: number;
  name: string;
  type?: string;
  geometryType?: string;
  fields?: Array<{
    name: string;
    type: string;
    alias?: string;
    length?: number;
  }>;
  extent?: unknown;
  capabilities?: string;
};

export class ArcgisError extends Error {
  readonly httpStatus: number;
  readonly serviceName?: string;
  readonly layerId?: number;
  readonly sample: string;

  constructor(args: {
    message: string;
    httpStatus: number;
    serviceName?: string;
    layerId?: number;
    sample: string;
  }) {
    super(args.message);
    this.name = "ArcgisError";
    this.httpStatus = args.httpStatus;
    this.serviceName = args.serviceName;
    this.layerId = args.layerId;
    this.sample = args.sample;
  }
}
