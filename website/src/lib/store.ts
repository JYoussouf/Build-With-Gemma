"use client";

import { useEffect } from "react";
import { create } from "zustand";

import { fromFrame, TelemetryFrame } from "./frame";
import {
  ClientMessage,
  ControlState,
  DEFAULT_WS_URL,
  RaceMeta,
  ServerMessage,
} from "./protocol";
import { DEFAULT_TRACK_KEY } from "./track";
import { Compound, Telemetry } from "./types";

/**
 * Client-side race state.
 *
 * This store no longer simulates anything. The server owns the race; this is a
 * projection of what it last sent, and every action is a request rather than a
 * local mutation. That is the whole point: two tabs pointed at one server show
 * one race, where before each tab ran its own simulator and drifted.
 */

export type ConnectionState = "connecting" | "open" | "closed";

const WS_URL = process.env.NEXT_PUBLIC_RACE_WS_URL ?? DEFAULT_WS_URL;

/** Reconnect backoff, milliseconds. Caps so a dead server is retried calmly. */
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 8000;

interface RaceStore {
  connection: ConnectionState;
  /** Null until the first snapshot arrives. */
  telemetry: Telemetry | null;
  /**
   * The most recent frame exactly as it came off the wire. Kept alongside the
   * unpacked telemetry so consumers that want canonical frames — the explore
   * view, which also replays them off disk — can take them without
   * re-deriving.
   */
  frame: TelemetryFrame | null;
  meta: RaceMeta | null;
  control: ControlState;
  trackKey: string;

  setSpeedMultiplier: (multiplier: number) => void;
  toggleRunning: () => void;
  reset: () => void;
  setTrack: (key: string) => void;
  approveAlert: (id: string, message?: string) => void;
  dismissAlert: (id: string) => void;
  pitStop: (compound: Compound) => void;
}

let socket: WebSocket | null = null;

function sendToServer(message: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export const useRaceStore = create<RaceStore>((set, get) => ({
  connection: "connecting",
  telemetry: null,
  frame: null,
  meta: null,
  control: { running: true, speedMultiplier: 4 },
  trackKey: DEFAULT_TRACK_KEY,

  setSpeedMultiplier: (multiplier) =>
    sendToServer({ type: "setSpeed", multiplier }),
  toggleRunning: () =>
    sendToServer({ type: "setRunning", running: !get().control.running }),
  reset: () => sendToServer({ type: "reset" }),
  setTrack: (key) => sendToServer({ type: "setTrack", key }),
  approveAlert: (id, message) => sendToServer({ type: "approve", id, message }),
  dismissAlert: (id) => sendToServer({ type: "dismiss", id }),
  pitStop: (compound) => sendToServer({ type: "pit", compound }),
}));

/**
 * Selects from live telemetry.
 *
 * Only valid beneath `<RaceGate>`, which does not render its children until
 * the first snapshot has arrived. Telemetry is never set back to null once it
 * has been received, so within the gate this is always defined — a dropped
 * connection freezes the last frame rather than blanking the screen.
 */
export function useTelemetry<T>(select: (t: Telemetry) => T): T {
  return useRaceStore((s) => {
    if (!s.telemetry) {
      throw new Error("useTelemetry used outside <RaceGate>");
    }
    return select(s.telemetry);
  });
}

/** Folds one server message into store state. */
function apply(message: ServerMessage) {
  const store = useRaceStore.getState();

  switch (message.type) {
    case "snapshot": {
      const { frame, live, laps, alerts, agentMessages, meta, control } = message;
      useRaceStore.setState({
        meta,
        control,
        trackKey: meta.trackKey,
        frame,
        telemetry: {
          ...fromFrame(frame, {
            fuelTargetPerLapKg: live.fuelTargetPerLapKg,
            socHistory: live.socHistory,
          }),
          status: live.status,
          totalLaps: meta.totalLaps,
          lastLapS: live.lastLapS,
          deltaToTargetS: live.deltaToTargetS,
          strategy: live.strategy,
          laps,
          alerts,
          agentMessages,
        },
      });
      break;
    }

    case "frame": {
      const current = store.telemetry;
      // A frame before the snapshot has no lists to merge into, so drop it;
      // the snapshot is moments away.
      if (!current) return;
      const { frame, live } = message;
      useRaceStore.setState({
        frame,
        telemetry: {
          ...current,
          ...fromFrame(frame, {
            fuelTargetPerLapKg: live.fuelTargetPerLapKg,
            socHistory: live.socHistory,
          }),
          status: live.status,
          lastLapS: live.lastLapS,
          deltaToTargetS: live.deltaToTargetS,
          strategy: live.strategy,
        },
      });
      break;
    }

    case "laps":
      if (!store.telemetry) return;
      useRaceStore.setState({
        telemetry: { ...store.telemetry, laps: message.laps },
      });
      break;

    case "alerts":
      if (!store.telemetry) return;
      useRaceStore.setState({
        telemetry: { ...store.telemetry, alerts: message.alerts },
      });
      break;

    case "agentMessages":
      if (!store.telemetry) return;
      useRaceStore.setState({
        telemetry: {
          ...store.telemetry,
          agentMessages: message.agentMessages,
        },
      });
      break;

    case "control":
      useRaceStore.setState({ control: message.control });
      break;

    case "meta":
      useRaceStore.setState({
        meta: message.meta,
        trackKey: message.meta.trackKey,
      });
      break;
  }
}

/**
 * Opens the connection to the race server and keeps it open.
 *
 * Mount once per page. The socket is a module singleton, so a second mount
 * would open a second connection and double the message rate.
 */
export function useRaceConnection() {
  useEffect(() => {
    let closed = false;
    let retryMs = RECONNECT_MIN_MS;
    let retryTimer: number | undefined;

    const connect = () => {
      if (closed) return;
      useRaceStore.setState({ connection: "connecting" });

      const ws = new WebSocket(WS_URL);
      socket = ws;

      ws.onopen = () => {
        retryMs = RECONNECT_MIN_MS;
        useRaceStore.setState({ connection: "open" });
      };

      ws.onmessage = (event) => {
        try {
          apply(JSON.parse(event.data as string) as ServerMessage);
        } catch (error) {
          console.error("bad message from race server", error);
        }
      };

      ws.onclose = () => {
        if (closed) return;
        useRaceStore.setState({ connection: "closed" });
        retryTimer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, RECONNECT_MAX_MS);
      };

      // An error is always followed by close, which owns the retry.
      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      socket?.close();
      socket = null;
    };
  }, []);
}
