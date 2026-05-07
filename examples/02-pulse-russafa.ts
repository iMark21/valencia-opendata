// Composite environmental pulse for a València neighborhood.
//   npm run example -- examples/02-pulse-russafa.ts
//
// Demonstrates VALMCP-14 (get_neighborhood_pulse). The score and the
// weights are opinionated — read `caveat` and `weights_used` before
// treating the number as official.

import { callTool, dump } from "./_lib.js";

const pulse = (await callTool("get_neighborhood_pulse", {
  barri: "russafa",
})) as {
  barri: string;
  pulse_score: number | null;
  components: Record<string, { score: number | null; value: unknown; unit: string }>;
  weights_used: Record<string, number>;
  caveat: string;
};

dump("Russafa — pulse", {
  barri: pulse.barri,
  pulse_score: pulse.pulse_score,
  weights_used: pulse.weights_used,
  components: Object.fromEntries(
    Object.entries(pulse.components).map(([k, v]) => [
      k,
      `${v.score ?? "—"} (${v.value ?? "n/a"} ${v.unit})`,
    ]),
  ),
  caveat: pulse.caveat,
});
