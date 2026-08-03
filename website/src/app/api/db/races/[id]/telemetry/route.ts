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
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "1000");
  try {
    const { getTelemetryFrames } = await import("@server/db");
    const frames = await getTelemetryFrames(id, Math.min(limit, 10000));
    return Response.json({ frames, count: frames.length });
  } catch (err) {
    return Response.json(
      { error: `Failed to get telemetry: ${err}` },
      { status: 500 },
    );
  }
}
