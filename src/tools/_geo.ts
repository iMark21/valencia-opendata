// Shared geo helpers used by curated tools.

// EPSG:25830 (UTM zone 30N, ETRS89) → WGS84 lon/lat.
// Closed-form inverse-UTM (Redfearn). Verified <1m precision against well-
// known landmarks in València; far below the spatial precision needed for
// MCP responses. Avoids pulling proj4 + types as a dependency.
export function utm30NToWgs84(x: number, y: number): [number, number] {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const lon0 = -3 * (Math.PI / 180);
  const fe = 500_000;
  const fn = 0;

  const xAdj = x - fe;
  const yAdj = y - fn;

  const m = yAdj / k0;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const n1 = a / Math.sqrt(1 - e2 * sinPhi1 ** 2);
  const t1 = tanPhi1 ** 2;
  const c1 = ep2 * cosPhi1 ** 2;
  const r1 = (a * (1 - e2)) / (1 - e2 * sinPhi1 ** 2) ** 1.5;
  const d = xAdj / (n1 * k0);

  const phi =
    phi1 -
    ((n1 * tanPhi1) / r1) *
      ((d ** 2) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4) / 24 +
        ((61 +
          90 * t1 +
          298 * c1 +
          45 * t1 ** 2 -
          252 * ep2 -
          3 * c1 ** 2) *
          d ** 6) /
          720);

  const lon =
    lon0 +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) *
        d ** 5) /
        120) /
      cosPhi1;

  return [lon * (180 / Math.PI), phi * (180 / Math.PI)];
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function normalizeAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
