import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // There is no landing page: the app opens on Replays. Declared here rather
  // than as a root page that redirects, so `/` is not a route at all - nothing
  // to render, nothing to keep in step with the tab bar.
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
  webpack(config) {
    config.resolve.alias["@server"] = path.join(__dirname, "server");
    return config;
  },
};

export default nextConfig;

// Gives `next dev` the same Cloudflare bindings the deployment has, so local
// development and the deployed Worker are the same code path.
initOpenNextCloudflareForDev();
