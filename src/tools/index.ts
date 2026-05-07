import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CkanClient } from "../clients/ckan.js";
import { ArcgisClient } from "../clients/arcgis.js";
import { Cache } from "../cache.js";
import { registerListDatasetsTool } from "./list_datasets.js";
import { registerGetDatasetTool } from "./get_dataset.js";
import { registerGetDatasetResourceTool } from "./get_dataset_resource.js";
import { registerQueryGeoLayerTool } from "./query_geo_layer.js";
import { registerFindGeoLayersTool } from "./find_geo_layers.js";
import { registerFullTextSearchTool } from "./full_text_search.js";
import { registerGetAirQualityTool } from "./get_air_quality.js";

export type ToolDeps = {
  ckan: CkanClient;
  arcgis: ArcgisClient;
};

export function buildDefaultDeps(): ToolDeps {
  const cache = new Cache<unknown>();
  return {
    ckan: new CkanClient({ cache }),
    arcgis: new ArcgisClient({ cache }),
  };
}

export function registerAllTools(server: McpServer, deps?: ToolDeps): void {
  const d = deps ?? buildDefaultDeps();
  registerListDatasetsTool(server, d.ckan);
  registerGetDatasetTool(server, d.ckan);
  registerGetDatasetResourceTool(server, { ckan: d.ckan });
  registerQueryGeoLayerTool(server, d.arcgis);
  registerFindGeoLayersTool(server, d.arcgis);
  registerFullTextSearchTool(server, d.ckan);
  registerGetAirQualityTool(server, d.arcgis);
  // VALMCP-11..14 curated tools
}
