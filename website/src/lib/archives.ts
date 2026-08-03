/**
 * Reads the staged `/data` archives from wherever this is running.
 *
 * `/data` sits outside `website/`, so `scripts/stage-data.ts` copies it into
 * `public/data` at build time rather than committing a second copy. Getting it
 * back out differs by environment, and the difference is not optional:
 *
 * - On Cloudflare the files are static assets, reachable only through the
 *   ASSETS binding. A plain `fetch` of the Worker's own URL is refused as a
 *   same-zone subrequest ("error code: 1042"), so the binding is the only way.
 * - Under `next dev` there is no binding, and `public/` is served by Next, so
 *   an ordinary fetch is both available and correct.
 */

export async function readArchive(path: string, base: string): Promise<Response> {
  const url = new URL(path, base);

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const assets = getCloudflareContext().env.ASSETS;
    if (assets) return await assets.fetch(url);
  } catch {
    // Not running on Workers. Fall through to the dev server.
  }

  return fetch(url);
}
