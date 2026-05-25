import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
  turbopack: {
    resolveAlias: {
      "@mcp/dist": path.resolve(__dirname, "../dist"),
    },
  },
};

export default nextConfig;
