/**
 * The race server: one process that owns the race and fans it out.
 *
 * Run from website/:  npm run dev:server
 *
 * Every client subscribes and renders what it is sent. Nothing simulates
 * locally any more, which is what makes the pit wall and the driver HUD show
 * the same race — previously each browser tab ran its own simulator and they
 * drifted apart immediately.
 *
 * This stands in for the Python backend in docs/data-flow.md. It is written in
 * TypeScript purely so it can import `src/lib/simulation.ts` directly: one
 * implementation of the physics rather than a second one in Python that has to
 * be kept in step. When the real backend arrives it should keep the wire
 * protocol in `src/lib/protocol.ts`, at which point the clients do not change.
 *
 * Persistence is backed by PostgreSQL (TimescaleDB-compatible schema). Every
 * tick's telemetry frame, lap summaries, agent messages, and alerts are written
 * to the database so races can be replayed and queried after the fact.
 */

import { WebSocketServer, WebSocket } from "ws";

import { centerFor, toFrame } from "../src/lib/frame";
import {
  ClientMessage,
  ControlState,
  DEFAULT_WS_PORT,
  LiveExtras,
  RaceMeta,
  ServerMessage,
} from "../src/lib/protocol";
import {
  applyApprove,
  applyDismiss,
  applyPit,
  createSimState,
  SimState,
  step,
} from "../src/lib/simulation";
import { DEFAULT_TRACK_KEY, getTrack } from "../src/lib/track";
import {
  insertAgentMessage,
  insertAlert,
  insertPitStop,
  insertRace,
  insertTelemetry,
  updateRaceStatus,
  upsertLapSummary,
} from "./db";

/** Wall-clock tick. Matches the 10 Hz packet rate the phone will stream at. */
const TICK_MS = 100;
/** Physics substep, so time compression cannot destabilise the models. */
const SUBSTEP_S = 0.1;
/** Persist telemetry every N ticks to avoid overwhelming the DB (1 Hz writes). */
const PERSIST_EVERY_TICKS = 10;

const port = Number(process.env.RACE_WS_PORT ?? DEFAULT_WS_PORT);

interface Race {
  id: string;
  /**
   * UUID from the database, so clients can query historical data.
   *
   * Null when no database is reachable. Persistence is a recording of the
   * race, not the race itself, so the simulation runs either way and every
   * write site skips instead of failing.
   */
  dbId: string | null;
  trackKey: string;
  sim: SimState;
  control: ControlState;
  /** Seconds of race time elapsed, which is what frame timestamps use. */
  clock: number;
  /** Tick counter since race start, for throttling DB writes. */
  tickCount: number;
  /** Lap count at the last persist, to detect new laps. */
  lastPersistedLap: number;
}

async function newRace(trackKey: string, control: ControlState): Promise<Race> {
  const track = getTrack(trackKey);
  const sim = createSimState(trackKey);
  // A missing database must not stop the race server from coming up. Without
  // this, Postgres being down took the whole pit wall with it: the socket never
  // opened, and Live sat on "no race server" with no way to start a run.
  let dbId: string | null = null;
  try {
    dbId = await insertRace(
      track.name,
      sim.telemetry.totalLaps,
      sim.telemetry.fuel.startKg,
      sim.telemetry.tyres.compound,
    );
  } catch (err) {
    // An unreachable Postgres surfaces as an AggregateError whose own message
    // is empty, so fall back to the code and then to the causes underneath it.
    const e = err as { message?: string; code?: string; errors?: { message: string }[] };
    const reason =
      e.message || e.code || e.errors?.map((c) => c.message).join("; ") || String(err);
    console.warn(`no database - running the simulation without recording it (${reason})`);
  }

  return {
    id: `race-${trackKey}-${Date.now().toString(36)}`,
    dbId,
    trackKey,
    sim,
    control,
    clock: 0,
    tickCount: 0,
    lastPersistedLap: 0,
  };
}

let race: Race;

const metaOf = (r: Race): RaceMeta => ({
  raceId: r.id,
  trackKey: r.trackKey,
  trackName: getTrack(r.trackKey).name,
  totalLaps: r.sim.telemetry.totalLaps,
});

const liveOf = (r: Race): LiveExtras => {
  const t = r.sim.telemetry;
  return {
    seq: t.seq,
    status: t.status,
    lastLapS: t.lastLapS,
    deltaToTargetS: t.deltaToTargetS,
    socHistory: t.ers.socHistory,
    fuelTargetPerLapKg: t.fuel.targetPerLapKg,
    fuelStartKg: t.fuel.startKg,
    strategy: t.strategy,
  };
};

const frameOf = (r: Race) =>
  toFrame(r.sim.telemetry, r.clock, r.sim.track, centerFor(r.trackKey));

const wss = new WebSocketServer({ port });
const clients = new Set<WebSocket>();

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(message: ServerMessage) {
  // Serialise once rather than per client.
  const payload = JSON.stringify(message);
  for (const socket of clients) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload);
  }
}

function snapshotFor(socket: WebSocket) {
  const t = race.sim.telemetry;
  send(socket, {
    type: "snapshot",
    meta: metaOf(race),
    control: race.control,
    frame: frameOf(race),
    live: liveOf(race),
    laps: t.laps,
    alerts: t.alerts,
    agentMessages: t.agentMessages,
  });
}

/**
 * Restarts the race, which is what changing track means — the physics state
 * is track-specific, so there is nothing to carry over.
 */
async function restart(trackKey: string) {
  race = await newRace(trackKey, race.control);
  broadcast({ type: "meta", meta: metaOf(race) });
  broadcast({ type: "control", control: race.control });
  for (const socket of clients) snapshotFor(socket);
}

function handle(message: ClientMessage) {
  switch (message.type) {
    case "approve":
      race.sim = applyApprove(race.sim, message.id, message.message);
      broadcast({ type: "alerts", alerts: race.sim.telemetry.alerts });
      break;

    case "dismiss":
      race.sim = applyDismiss(race.sim, message.id);
      broadcast({ type: "alerts", alerts: race.sim.telemetry.alerts });
      break;

    case "pit":
      const oldCompound = race.sim.telemetry.tyres.compound;
      const lapAtPit = race.sim.telemetry.lap;
      const wearAtPit = race.sim.telemetry.tyres.wearPct;
      race.sim = applyPit(race.sim, message.compound);
      if (race.dbId !== null) {
        insertPitStop(race.dbId, lapAtPit, oldCompound, message.compound, wearAtPit).catch(
          (err) => console.error("DB pit stop insert failed:", err),
        );
      }
      broadcast({
        type: "agentMessages",
        agentMessages: race.sim.telemetry.agentMessages,
      });
      break;

    case "setTrack":
      restart(message.key);
      break;

    case "setSpeed":
      race.control = { ...race.control, speedMultiplier: message.multiplier };
      broadcast({ type: "control", control: race.control });
      break;

    case "setRunning":
      race.control = { ...race.control, running: message.running };
      broadcast({ type: "control", control: race.control });
      break;

    case "startDriving":
      // A fresh run each time, so "start driving" never resumes a stale race.
      if (!race.control.driving) {
        void newRace(race.trackKey, { ...race.control, driving: true }).then(
          (fresh) => {
            race = fresh;
            broadcast({ type: "meta", meta: metaOf(race) });
            broadcast({ type: "control", control: race.control });
            for (const socket of clients) snapshotFor(socket);
          },
        );
      } else {
        broadcast({ type: "control", control: race.control });
      }
      break;

    case "stopDriving":
      race.control = { ...race.control, driving: false };
      broadcast({ type: "control", control: race.control });
      break;

    case "reset":
      restart(race.trackKey);
      break;
  }
}

/** Persists a telemetry frame, new laps, new alerts, and new agent messages to PostgreSQL. */
async function persistTick(before: typeof race.sim.telemetry, after: typeof race.sim.telemetry) {
  race.tickCount++;

  // No database: skip silently rather than log a failure ten times a second.
  if (race.dbId === null) return;

  // Persist telemetry at 1 Hz (every 10 ticks) to keep DB load reasonable.
  if (race.tickCount % PERSIST_EVERY_TICKS === 0) {
    const frame = frameOf(race);
    try {
      await insertTelemetry(race.dbId, frame);
    } catch (err) {
      console.error("DB telemetry insert failed:", err);
    }
  }

  // New lap detected — persist the lap summary.
  if (after.laps !== before.laps && after.laps.length > 0) {
    const lastLap = after.laps[after.laps.length - 1];
    try {
      await upsertLapSummary(race.dbId, lastLap);
    } catch (err) {
      console.error("DB lap summary insert failed:", err);
    }
  }

  // New alerts — persist them.
  if (after.alerts !== before.alerts) {
    const newAlerts = after.alerts.filter(
      (a) => !before.alerts.some((b) => b.id === a.id),
    );
    for (const alert of newAlerts) {
      try {
        await insertAlert(race.dbId, alert);
      } catch (err) {
        console.error("DB alert insert failed:", err);
      }
    }
  }

  // New agent messages — persist them.
  if (after.agentMessages !== before.agentMessages) {
    const newMsgs = after.agentMessages.filter(
      (m) => !before.agentMessages.some((b) => b.id === m.id),
    );
    for (const msg of newMsgs) {
      try {
        await insertAgentMessage(race.dbId, msg);
      } catch (err) {
        console.error("DB agent message insert failed:", err);
      }
    }
  }
}

wss.on("connection", (socket) => {
  clients.add(socket);
  snapshotFor(socket);
  console.log(`client connected (${clients.size} total)`);

  socket.on("message", (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      // A malformed frame from one client must not take the race down.
      console.warn("ignoring unparseable client message");
      return;
    }
    try {
      handle(message);
    } catch (error) {
      console.error(`error handling ${message.type}:`, error);
    }
  });

  socket.on("close", () => {
    clients.delete(socket);
    console.log(`client disconnected (${clients.size} remaining)`);
  });

  socket.on("error", () => clients.delete(socket));
});

// The race advances whether or not anyone is watching, so a client that joins
// late sees a race in progress rather than one that starts when they arrive.
setInterval(() => {
  // Nothing to simulate until someone drives.
  if (!race.control.driving) return;
  if (!race.control.running || race.sim.telemetry.status !== "live") return;

  const before = race.sim.telemetry;
  const dt = (TICK_MS / 1000) * race.control.speedMultiplier;
  const steps = Math.max(1, Math.ceil(dt / SUBSTEP_S));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) race.sim = step(race.sim, h);
  race.clock += dt;

  const after = race.sim.telemetry;
  broadcast({ type: "frame", frame: frameOf(race), live: liveOf(race) });

  // Persist to PostgreSQL (fire-and-forget so the tick loop never blocks).
  persistTick(before, after).catch((err) =>
    console.error("persist tick error:", err),
  );

  // The simulator replaces these arrays rather than mutating them, so an
  // identity check is enough to spot a new lap, alert, or agent message.
  if (after.laps !== before.laps) {
    broadcast({ type: "laps", laps: after.laps });
  }
  if (after.alerts !== before.alerts) {
    broadcast({ type: "alerts", alerts: after.alerts });
  }
  if (after.agentMessages !== before.agentMessages) {
    broadcast({ type: "agentMessages", agentMessages: after.agentMessages });
  }

  // When the race finishes, mark it in the database.
  if (after.status === "finished" && race.lastPersistedLap !== -1) {
    race.lastPersistedLap = -1;
    if (race.dbId !== null) {
      updateRaceStatus(race.dbId, "completed").catch((err) =>
        console.error("DB race status update failed:", err),
      );
    }
  }
}, TICK_MS);

async function main() {
  race = await newRace(DEFAULT_TRACK_KEY, {
    // Stationary until someone drives. A server that comes up mid-race is the
    // thing the Live view's stationary state exists to prevent.
    driving: false,
    running: true,
    speedMultiplier: 4,
  });
  console.log(
    `race server on ws://localhost:${port}\n` +
      `  track ${race.trackKey}, ${race.sim.telemetry.totalLaps} laps, ` +
      `${race.control.speedMultiplier}x speed\n` +
      `  db race id: ${race.dbId ?? "none (not recording)"}\n` +
      `  vehicle stationary — waiting for a driver`,
  );
}

main().catch((err) => {
  console.error("Failed to start race server:", err);
  process.exit(1);
});
