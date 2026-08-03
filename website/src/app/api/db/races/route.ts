/**
 * Local-only: these read the Postgres recording of a race.
 *
 * The import is deferred to request time because `pg` opens TCP sockets and
 * cannot load on Workers at all — a static import would fail the Cloudflare
 * build for every route in the app, not just this one. Deferred, a
 * deployment without a database answers 500 here and serves everything else,
 * which is what it already did when Postgres was down locally.
 */

export async function GET() {
  try {
    const { listRaces } = await import("@server/db");
    const races = await listRaces();
    return Response.json({ races });
  } catch (err) {
    return Response.json(
      { error: `Failed to list races: ${err}` },
      { status: 500 },
    );
  }
}
