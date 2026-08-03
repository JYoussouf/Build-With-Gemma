/**
 * The race server as a Durable Object, for the Cloudflare deployment.
 *
 * `server/index.ts` is the same server for local development: one process that
 * owns the race and fans it out over WebSockets. Workers has no long-lived
 * process to put that in, so on Cloudflare the race lives in a Durable Object
 * instead — a single named instance that every client connects to, which is
 * what keeps them all rendering the same race.
 *
 * The physics is the shared `src/lib/simulation.ts`, exactly as the local
 * server uses it, so the two cannot drift. The wire protocol is unchanged, so
 * the browser does not know or care which one it is talking to.
 *
 * Two deliberate differences from the local server:
 *
 * 1. No persistence. The Postgres recording is a local-development feature and
 *    there is no database in front of the deployment, so the replay views read
 *    the static archives in `/data` instead.
 * 2. The race only ticks while someone is connected. The local server advances
 *    the race whether or not anyone is watching; here that would burn Durable
 *    Object duration around the clock for nobody's benefit, so the last client
 *    to leave stops the clock and the first to arrive starts it again.
 */

import { DurableObject } from "cloudflare:workers";

import { centerFor, toFrame } from "../src/lib/frame";
import {
  ClientMessage,
  ControlState,
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
    id: `race-${trackKey}-${Date.now().toString(36)}`,
    trackKey,
    sim: createSimState(trackKey),
    control,
    clock: 0,
  };
}

export class RaceServer extends DurableObject {
  private race: Race = newRace(DEFAULT_TRACK_KEY, {
    // Stationary until someone drives. A server that comes up mid-race is the
    // thing the Live view's stationary state exists to prevent.
    driving: false,
    running: true,
    speedMultiplier: 4,
  });

  private sockets = new Set<WebSocket>();
  private ticker: ReturnType<typeof setInterval> | null = null;

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected a websocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sockets.add(server);

    this.snapshotFor(server);
    this.startTicking();

    server.addEventListener("message", (event) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(event.data)) as ClientMessage;
      } catch {
        // A malformed frame from one client must not take the race down.
        console.warn("ignoring unparseable client message");
        return;
      }
      try {
        this.handle(message);
      } catch (error) {
        console.error(`error handling ${message.type}:`, error);
      }
    });

    const drop = () => {
      this.sockets.delete(server);
      // Nobody is watching, so nothing needs simulating. The race state stays
      // in memory: whoever arrives next picks it up where it stopped.
      if (this.sockets.size === 0) this.stopTicking();
    };
    server.addEventListener("close", drop);
    server.addEventListener("error", drop);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Wire helpers ────────────────────────────────────────────────────

  private metaOf(): RaceMeta {
    return {
      raceId: this.race.id,
      trackKey: this.race.trackKey,
      trackName: getTrack(this.race.trackKey).name,
      totalLaps: this.race.sim.telemetry.totalLaps,
    };
  }

  private liveOf(): LiveExtras {
    const t = this.race.sim.telemetry;
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
  }

  private frameOf() {
    return toFrame(
      this.race.sim.telemetry,
      this.race.clock,
      this.race.sim.track,
      centerFor(this.race.trackKey),
    );
  }

  private send(socket: WebSocket, message: ServerMessage) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // Racing a close. The close handler will drop it.
    }
  }

  private broadcast(message: ServerMessage) {
    // Serialise once rather than per client.
    const payload = JSON.stringify(message);
    for (const socket of this.sockets) {
      try {
        socket.send(payload);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }

  private snapshotFor(socket: WebSocket) {
    const t = this.race.sim.telemetry;
    this.send(socket, {
      type: "snapshot",
      meta: this.metaOf(),
      control: this.race.control,
      frame: this.frameOf(),
      live: this.liveOf(),
      laps: t.laps,
      alerts: t.alerts,
      agentMessages: t.agentMessages,
    });
  }

  /**
   * Restarts the race, which is what changing track means — the physics state
   * is track-specific, so there is nothing to carry over.
   */
  private restart(trackKey: string) {
    this.race = newRace(trackKey, this.race.control);
    this.broadcast({ type: "meta", meta: this.metaOf() });
    this.broadcast({ type: "control", control: this.race.control });
    for (const socket of this.sockets) this.snapshotFor(socket);
  }

  // ── Client messages ─────────────────────────────────────────────────

  private handle(message: ClientMessage) {
    switch (message.type) {
      case "approve":
        this.race.sim = applyApprove(this.race.sim, message.id, message.message);
        this.broadcast({ type: "alerts", alerts: this.race.sim.telemetry.alerts });
        break;

      case "dismiss":
        this.race.sim = applyDismiss(this.race.sim, message.id);
        this.broadcast({ type: "alerts", alerts: this.race.sim.telemetry.alerts });
        break;

      case "pit":
        this.race.sim = applyPit(this.race.sim, message.compound);
        this.broadcast({
          type: "agentMessages",
          agentMessages: this.race.sim.telemetry.agentMessages,
        });
        break;

      case "setTrack":
        this.restart(message.key);
        break;

      case "setSpeed":
        this.race.control = { ...this.race.control, speedMultiplier: message.multiplier };
        this.broadcast({ type: "control", control: this.race.control });
        break;

      case "setRunning":
        this.race.control = { ...this.race.control, running: message.running };
        this.broadcast({ type: "control", control: this.race.control });
        break;

      case "startDriving":
        // A fresh run each time, so "start driving" never resumes a stale race.
        if (!this.race.control.driving) {
          this.race = newRace(this.race.trackKey, { ...this.race.control, driving: true });
          this.broadcast({ type: "meta", meta: this.metaOf() });
          this.broadcast({ type: "control", control: this.race.control });
          for (const socket of this.sockets) this.snapshotFor(socket);
          this.broadcast({
            type: "indicator",
            indicator: { kind: "start", message: "Race started", urgency: "info" },
          });
        } else {
          this.broadcast({ type: "control", control: this.race.control });
        }
        this.startTicking();
        break;

      case "stopDriving":
        this.race.control = { ...this.race.control, driving: false };
        this.broadcast({ type: "control", control: this.race.control });
        this.broadcast({
          type: "indicator",
          indicator: { kind: "stop", message: "Race stopped", urgency: "warn" },
        });
        break;

      case "reset":
        this.restart(this.race.trackKey);
        this.broadcast({
          type: "indicator",
          indicator: { kind: "reset", message: "Race reset", urgency: "info" },
        });
        break;

      case "trace_point":
        this.broadcast({
          type: "trace_point",
          point: {
            lat: message.lat,
            lon: message.lon,
            ts: message.ts,
            speed: message.speed,
          },
        });
        break;
    }
  }

  // ── The clock ───────────────────────────────────────────────────────

  private startTicking() {
    if (this.ticker !== null) return;
    this.ticker = setInterval(() => this.tick(), TICK_MS);
  }

  private stopTicking() {
    if (this.ticker === null) return;
    clearInterval(this.ticker);
    this.ticker = null;
  }

  private tick() {
    // Nothing to simulate until someone drives.
    if (!this.race.control.driving) return;
    if (!this.race.control.running || this.race.sim.telemetry.status !== "live") return;

    const before = this.race.sim.telemetry;
    const dt = (TICK_MS / 1000) * this.race.control.speedMultiplier;
    const steps = Math.max(1, Math.ceil(dt / SUBSTEP_S));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.race.sim = step(this.race.sim, h);
    this.race.clock += dt;

    const after = this.race.sim.telemetry;
    this.broadcast({ type: "frame", frame: this.frameOf(), live: this.liveOf() });

    // The simulator replaces these arrays rather than mutating them, so an
    // identity check is enough to spot a new lap, alert, or agent message.
    if (after.laps !== before.laps) {
      this.broadcast({ type: "laps", laps: after.laps });
    }
    if (after.alerts !== before.alerts) {
      this.broadcast({ type: "alerts", alerts: after.alerts });
      const newAlerts = after.alerts.filter(
        (a) => !before.alerts.some((b) => b.id === a.id),
      );
      for (const alert of newAlerts) {
        this.broadcast({
          type: "indicator",
          indicator: { kind: "alert", message: alert.title, urgency: alert.severity },
        });
      }
    }
    if (after.agentMessages !== before.agentMessages) {
      this.broadcast({ type: "agentMessages", agentMessages: after.agentMessages });
      const newMsgs = after.agentMessages.filter(
        (m) => !before.agentMessages.some((b) => b.id === m.id),
      );
      for (const msg of newMsgs) {
        this.broadcast({
          type: "indicator",
          indicator: { kind: "agent", message: msg.text, urgency: "info" },
        });
      }
    }
  }
}
