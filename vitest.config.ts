import { defineConfig } from "vitest/config";

// When RECORD=1 or INTEGRATION=1 we hit two live portals
// (opendata.vlci.valencia.es and geoportal.valencia.es). Running test files
// in parallel fans out enough requests to trip the portals' rate limit /
// throttling — observed in VALMCP-08 when adding a 7th integration suite.
// Run sequentially in those modes; replay-only runs stay parallel for speed.
const live = process.env.INTEGRATION === "1" || process.env.RECORD === "1";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    setupFiles: ["tests/_fixtures/setup.ts"],
    fileParallelism: !live,
    testTimeout: live ? 30_000 : 5_000,
  },
});
