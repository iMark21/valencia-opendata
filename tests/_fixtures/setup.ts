import { installFetchInterceptor } from "./index.js";

// Vitest setupFile: runs once per worker before any test imports.
// Patches global fetch so that ArcgisClient/CkanClient (which read from
// globalThis.fetch by default) use the record/replay layer transparently.
installFetchInterceptor();
