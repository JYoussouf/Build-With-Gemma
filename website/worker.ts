/**
 * The Cloudflare entrypoint.
 *
 * Everything except the race socket is Next.js, handled by the OpenNext
 * adapter. `/ws` is the exception: it is a WebSocket upgrade, which Next has
 * no way to serve, so it goes to the single Durable Object instance that owns
 * the race. One name, so every visitor lands on the same race rather than each
 * getting a private one — the whole point of the server owning it.
 */

// @ts-expect-error - a build artifact: `.open-next/` is produced by
// `opennextjs-cloudflare build` and gitignored, so there is nothing for tsc to
// resolve. `allowJs` is off in tsconfig.worker.json so this stays unresolvable
// after a build too, and the suppression cannot go stale.
import { default as handler } from "./.open-next/worker.js";

import { RaceServer } from "./server/race-do";

export default {
  fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const id = env.RACE.idFromName("the-race");
      return env.RACE.get(id).fetch(request);
    }
    return handler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;

export { RaceServer };
