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
 * Not implemented, and deliberately so for a one-day build: auth, persistence,
 * and more than one concurrent race. See the database discussion in the
 * project notes — durable history is a post-hackathon concern.
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

/** Wall-clock tick. Matches the 10 Hz packet rate the phone will stream at. */
const TICK_MS = 100;
/** Physics substep, so time compression cannot destabilise the models. */
const SUBSTEP_S = 0.1;

const port = Number(process.env.RACE_WS_PORT ?? DEFAULT_WS_PORT);

interface Race {
  id: string;
  trackKey: string;
  sim: SimState;
  control: ControlState;
  /** Seconds of race time elapsed, which is what frame timestamps use. */
  clock: number;
}

function newRace(trackKey: string, control: ControlState): Race {
  return {
    // Stable per race so a reconnecting client can tell it is the same one.
    id: `race-${trackKey}-${Date.now().toString(36)}`,
    trackKey,
    sim: createSimState(trackKey),
    control,
    clock: 0,
  };
}

let race = newRace(DEFAULT_TRACK_KEY, { running: true, speedMultiplier: 4 });

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
function restart(trackKey: string) {
  race = newRace(trackKey, race.control);
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
      race.sim = applyPit(race.sim, message.compound);
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

    case "reset":
      restart(race.trackKey);
      break;
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
  if (!race.control.running || race.sim.telemetry.status !== "live") return;

  const before = race.sim.telemetry;
  const dt = (TICK_MS / 1000) * race.control.speedMultiplier;
  const steps = Math.max(1, Math.ceil(dt / SUBSTEP_S));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) race.sim = step(race.sim, h);
  race.clock += dt;

  const after = race.sim.telemetry;
  broadcast({ type: "frame", frame: frameOf(race), live: liveOf(race) });

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
}, TICK_MS);

console.log(
  `race server on ws://localhost:${port}\n` +
    `  track ${race.trackKey}, ${race.sim.telemetry.totalLaps} laps, ` +
    `${race.control.speedMultiplier}x speed`,
);
