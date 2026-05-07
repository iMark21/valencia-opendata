// Discover datasets and ArcGIS layers in the València portal.
//   npm run example -- examples/01-discover.ts
//
// Demonstrates VALMCP-04 (list_datasets) + VALMCP-08 (find_geo_layers)
// working together so an LLM can navigate from theme → dataset → layer.

import { callTool, dump } from "./_lib.js";

const datasets = (await callTool("list_datasets", {
  query: "movilidad",
  limit: 5,
})) as {
  total: number;
  count: number;
  results: Array<{ id: string; title: string }>;
};

dump("datasets matching 'movilidad'", {
  total: datasets.total,
  shown: datasets.count,
  ids: datasets.results.map((d) => `${d.id} — ${d.title}`),
});

const layers = (await callTool("find_geo_layers", {
  service: "OPENDATA/Trafico",
})) as { layers: Array<{ layer_id: number; name: string }> };

dump("ArcGIS layers under OPENDATA/Trafico (first 8)", {
  count: layers.layers.length,
  preview: layers.layers.slice(0, 8).map((l) => `${l.layer_id} — ${l.name}`),
});
