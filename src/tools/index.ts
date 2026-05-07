import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CkanClient } from "../clients/ckan.js";
import { ArcgisClient } from "../clients/arcgis.js";
import { Cache } from "../cache.js";
import { registerListDatasetsTool } from "./list_datasets.js";

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
  // VALMCP-05 get_dataset
  // VALMCP-06 get_dataset_resource
  // VALMCP-07 query_geo_layer
  // VALMCP-08 find_geo_layers
  // VALMCP-09 full_text_search
  // VALMCP-10..14 curated tools
}
