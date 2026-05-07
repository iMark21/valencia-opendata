// Combine ValenBisi availability + closest air-quality reading.
//   npm run example -- examples/04-near-me.ts
//
// Demonstrates VALMCP-11 (get_valenbisi_availability) + VALMCP-10
// (get_air_quality with `near`) — the kind of cross-dataset answer an
// agent would compose for a "what's it like at this corner?" question.

import { callTool, dump } from "./_lib.js";

const HERE = { lat: 39.4699, lng: -0.3763, radius_m: 600 }; // Plaça de l'Ajuntament

const bikes = (await callTool("get_valenbisi_availability", {
  near: HERE,
  limit: 5,
})) as {
  stations: Array<{
    name: string;
    bikes_available: number;
    docks_free: number;
    distance_m?: number;
  }>;
};

const air = (await callTool("get_air_quality", {
  near: HERE,
})) as {
  stations: Array<{
    name: string;
    distance_m?: number;
    readings: Array<{ pollutant: string; value: number; unit: string }>;
  }>;
};

dump("ValenBisi near Plaça de l'Ajuntament", {
  stations: bikes.stations.map((s) => ({
    name: s.name,
    bikes: s.bikes_available,
    docks: s.docks_free,
    m: s.distance_m,
  })),
});

dump("Closest air-quality station", {
  station: air.stations[0]?.name,
  distance_m: air.stations[0]?.distance_m,
  readings: air.stations[0]?.readings,
});
