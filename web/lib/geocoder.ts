interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  display_name: string;
}

// Bounding box for Valencia metropolitan area (W,S,E,N)
const VALENCIA_VIEWBOX = "-0.50,39.35,-0.25,39.58";

export async function geocodeAddress(query: string): Promise<GeoPoint | null> {
  const q = encodeURIComponent(query);
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${q}&format=json&limit=1&countrycodes=es` +
    `&viewbox=${VALENCIA_VIEWBOX}&bounded=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": "valencIA-demo/1.0 (open data contest)" },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as NominatimResult[];
  if (!data.length) return null;

  return {
    lat: parseFloat(data[0]!.lat),
    lng: parseFloat(data[0]!.lon),
    display_name: data[0]!.display_name,
  };
}
