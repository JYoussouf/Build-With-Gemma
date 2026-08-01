/**
 * One recorded run: its summary, every lap, and every alert that fired.
 *
 * Resolved through the manifest, since a run id is not a track key and two
 * runs can read the same archive.
 *
 * Deliberately a separate endpoint from anything the live race uses. A
 * recorded alert is a record of what fired during that race — it is not a
 * pending item, and nothing here should ever reach the engineer's approval
 * queue or the agent feed. Replay is evidence, not telemetry.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import manifest from "@data/timeseries/runs.json";

const DATA = join(process.cwd(), "..", "data");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Resolved against a fixed list before any path is built, so a crafted id
  // cannot escape data/timeseries.
  const entry = manifest.runs.find((r) => r.id === id);
  if (!entry) {
    return Response.json({ error: `unknown run: ${id}` }, { status: 404 });
  }

  const dir = join(DATA, "timeseries", entry.archive);
  try {
    const [meta, laps, alerts] = await Promise.all([
      readFile(join(dir, "meta.json"), "utf8"),
      readFile(join(dir, "laps.json"), "utf8"),
      readFile(join(dir, "alerts.json"), "utf8"),
    ]);
    const overrides =
      "overrides" in entry ? (entry.overrides as Record<string, unknown>) : {};
    return Response.json(
      {
        meta: { ...JSON.parse(meta), ...overrides, id: entry.id, label: entry.label },
        laps: JSON.parse(laps),
        alerts: JSON.parse(alerts),
      },
      { headers: { "cache-control": "public, max-age=3600" } },
    );
  } catch {
    return Response.json(
      { error: `no archive for ${id} - run npm run generate:data` },
      { status: 404 },
    );
  }
}
