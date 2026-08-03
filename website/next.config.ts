import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  webpack(config) {
    config.resolve.alias["@server"] = path.join(__dirname, "server");
    return config;
  },
};

export default nextConfig;

// Gives `next dev` the same Cloudflare bindings the deployment has, so local
// development and the deployed Worker are the same code path.
initOpenNextCloudflareForDev();
