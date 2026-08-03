/**
 * Local-only: these read the Postgres recording of a race.
 *
 * The import is deferred to request time because `pg` opens TCP sockets and
 * cannot load on Workers at all — a static import would fail the Cloudflare
 * build for every route in the app, not just this one. Deferred, a
 * deployment without a database answers 500 here and serves everything else,
 * which is what it already did when Postgres was down locally.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { getRaceById } = await import("@server/db");
    const race = await getRaceById(id);
    if (!race) {
      return Response.json({ error: `race not found: ${id}` }, { status: 404 });
    }
    return Response.json({ race });
  } catch (err) {
    return Response.json(
      { error: `Failed to get race: ${err}` },
      { status: 500 },
    );
  }
}
