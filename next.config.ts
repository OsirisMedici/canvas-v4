import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "jsdom", "mammoth"],
  outputFileTracingExcludes: {
    "/*": [
      "./data/**/*",
      "./logs/**/*",
      "./.venv/**/*",
      "./dist/**/*",
      "./desktop-electron/**/*",
      "./assets/**/*",
    ],
  },
};

export default nextConfig;
