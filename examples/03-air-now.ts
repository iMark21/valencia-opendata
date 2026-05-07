// Live air quality + history pointer.
//   npm run example -- examples/03-air-now.ts
//
// Demonstrates VALMCP-10 (get_air_quality). The MCP only returns the
// live snapshot; the multi-MB historical CSV is exposed as a pointer
// the client can fetch directly when needed.

import { callTool, dump } from "./_lib.js";

const air = (await callTool("get_air_quality", {})) as {
  stations: Array<{
    name: string;
    lat: number;
    lng: number;
    readings: Array<{ pollutant: string; value: number; unit: string }>;
  }>;
  history_pointer: { dataset_id: string; size_mb?: number; url?: string };
};

const top = air.stations.slice(0, 5).map((s) => ({
  station: s.name,
  no2: s.readings.find((r) => r.pollutant === "no2")?.value ?? null,
}));

dump("live NO₂ — top 5 stations", top);
dump("history pointer (not downloaded)", air.history_pointer);
