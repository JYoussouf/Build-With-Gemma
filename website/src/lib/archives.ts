/**
 * Reads the staged `/data` archives from wherever this is running.
 *
 * `/data` sits outside `website/`, so `scripts/stage-data.ts` copies it into
 * `public/data` at build time rather than committing a second copy. Getting it
 * back out differs by environment:
 *
 * - On Cloudflare the files are static assets, reachable only through the
 *   ASSETS binding. A plain `fetch` of the Worker's own URL is refused as a
 *   same-zone subrequest ("error code: 1042").
 * - Under `next dev` there is no binding, and `public/` is served by Next, so
 *   an ordinary fetch is both available and correct.
 *
 * The binding is looked up with `async: true`. The synchronous form reads an
 * AsyncLocalStorage context that is not always propagated — under a
 * `Promise.all` of several reads, some would come back without it. An earlier
 * version treated that as "not on Workers" and fell through to the plain
 * fetch, which on Workers is the refused self-fetch: the archive read failed
 * for perhaps a tenth of requests, and the caller reported it as a missing
 * archive. Hence the split below. Being on Workers without ASSETS is a
 * deployment fault and throws; only the absence of the adapter itself, which
 * means this is not Workers at all, is allowed to fall back.
 */

/**
 * Structural, because `Fetcher` is a workerd global and those types are kept
 * out of the app's typecheck — they redefine browser globals. This is the only
 * part of the binding used here.
 */
interface AssetFetcher {
  fetch(input: URL): Promise<Response>;
}

async function assetsBinding(): Promise<AssetFetcher | null> {
  let getCloudflareContext: typeof import("@opennextjs/cloudflare").getCloudflareContext;
  try {
    ({ getCloudflareContext } = await import("@opennextjs/cloudflare"));
  } catch {
    return null; // Not running on Workers.
  }

  const { env } = await getCloudflareContext({ async: true });
  if (!env.ASSETS) {
    throw new Error("running on Workers with no ASSETS binding - check wrangler.jsonc");
  }
  return env.ASSETS;
}

export async function readArchive(path: string, base: string): Promise<Response> {
  const url = new URL(path, base);
  const assets = await assetsBinding();
  return assets ? assets.fetch(url) : fetch(url);
}
