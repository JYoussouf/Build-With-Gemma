/**
 * Copies `/data` into `public/data` so the deployment can serve it.
 *
 * `/data` deliberately sits outside `website/` — it is shared with the Flutter
 * app, and duplicating it into the repo would be a second copy to drift. Local
 * development reads it in place through the API routes. Cloudflare has no
 * filesystem to read it from, so the build stages a copy into `public/`, where
 * it is uploaded as static assets and served at `/data/...`.
 *
 * `public/data` is generated and gitignored: `/data` stays the single copy in
 * source. Run by `prebuild`, so no deploy can ship without it.
 */

import { cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "data");
const target = join(here, "..", "public", "data");

// Wrapped rather than top-level await: tsx compiles this to CJS, which has no
// top-level await, and the build runs it through tsx.
async function main() {
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
  console.log(`staged ${source} -> ${target}`);
}

main().catch((err) => {
  console.error("failed to stage /data:", err);
  process.exit(1);
});
