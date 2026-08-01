"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createSimState, SimState, step } from "./simulation";
import { createSmoothingState, publish } from "./snapshot";
import { DEFAULT_TRACK_KEY } from "./track";
import { Compound, Telemetry } from "./types";

/** Wall-clock tick rate. Matches the 10 Hz phone packet rate. */
const TICK_MS = 100;

interface RaceStore {
  sim: SimState;
  /** Raw simulator output. The source of truth, and what gets stored. */
  telemetry: Telemetry;
  /**
   * The one snapshot the dashboard renders (feedback/round-01 D2). Derived
   * from `telemetry` once per tick by `snapshot.ts`, carrying the same `seq`,
   * so every widget in a frame is looking at the same instant.
   */
  display: Telemetry;
  /** Which of the tracks in /data/tracks the race is running on. */
  trackKey: string;
  /** 1x is real time; higher values compress the race for demos. */
  speedMultiplier: number;
  running: boolean;
  tick: (dt: number) => void;
  setSpeedMultiplier: (m: number) => void;
  toggleRunning: () => void;
  reset: () => void;
  setTrack: (key: string) => void;
  approveAlert: (id: string, message?: string) => void;
  dismissAlert: (id: string) => void;
  pitStop: (compound: Compound) => void;
}

const initial = createSimState(DEFAULT_TRACK_KEY);
const smoothing = createSmoothingState();

export const useRaceStore = create<RaceStore>((set, get) => ({
  sim: initial,
  telemetry: initial.telemetry,
  display: initial.telemetry,
  trackKey: DEFAULT_TRACK_KEY,
  speedMultiplier: 4,
  running: true,

  tick: (dt) => {
    // Integrate in <=100 ms substeps so time compression doesn't destabilise
    // the braking model or skip a start/finish crossing.
    const steps = Math.max(1, Math.ceil(dt / 0.1));
    const h = dt / steps;
    let sim = get().sim;
    for (let i = 0; i < steps; i++) sim = step(sim, h);
    set({ sim, telemetry: sim.telemetry, display: publish(smoothing, sim.telemetry) });
  },

  setSpeedMultiplier: (speedMultiplier) => set({ speedMultiplier }),
  toggleRunning: () => set((s) => ({ running: !s.running })),

  reset: () => {
    const fresh = createSimState(get().trackKey);
    smoothing.prev = null;
    set({
      sim: fresh,
      telemetry: fresh.telemetry,
      display: fresh.telemetry,
      running: true,
    });
  },

  // Changing track restarts the race — the physics state is track-specific.
  setTrack: (key) => {
    const fresh = createSimState(key);
    smoothing.prev = null;
    set({
      sim: fresh,
      telemetry: fresh.telemetry,
      display: fresh.telemetry,
      trackKey: key,
      running: true,
    });
  },

  approveAlert: (id, message) =>
    set((s) =>
      editAlerts(s, (a) =>
        a.id === id
          ? { ...a, status: "sent" as const, message: message ?? a.message }
          : a,
      ),
    ),

  dismissAlert: (id) =>
    set((s) =>
      editAlerts(s, (a) =>
        a.id === id ? { ...a, status: "dismissed" as const } : a,
      ),
    ),

  pitStop: (compound) =>
    set((s) => {
      const fit = (t: Telemetry): Telemetry => ({
        ...t,
        tyres: {
          ...t.tyres,
          compound,
          wearPct: 0,
          gripLevel: 1,
          // A set fitted now is running its first lap, not its zeroth (D2).
          ageLaps: 1,
          temps: { fl: 78, fr: 80, rl: 76, rr: 77 },
        },
        strategy: { ...t.strategy, stintLap: 1 },
        agentMessages: [
          {
            id: `gemma-pit-${t.lap}`,
            lap: t.lap,
            text: `Box confirmed. ${compound.toUpperCase()} fitted on lap ${t.lap}. Two laps to build temperature — push T1 to T4.`,
            createdAt: 0,
          },
          ...t.agentMessages,
        ].slice(0, 20),
      });

      const telemetry = fit(s.telemetry);
      // Fresh rubber is a step change, not a trend — drop the filter memory so
      // the new temperatures appear immediately rather than ramping in.
      smoothing.prev = null;
      return { telemetry, display: fit(s.display), sim: { ...s.sim, telemetry } };
    }),
}));

/**
 * Applies an edit to the alert list on both the raw telemetry and the rendered
 * snapshot. Alerts are never smoothed, so the two stay identical — but they
 * have to move together, or an approval would not show until the next tick.
 */
function editAlerts(
  s: RaceStore,
  edit: (a: Telemetry["alerts"][number]) => Telemetry["alerts"][number],
): Partial<RaceStore> {
  const telemetry: Telemetry = { ...s.telemetry, alerts: s.telemetry.alerts.map(edit) };
  const display: Telemetry = { ...s.display, alerts: s.display.alerts.map(edit) };
  return { telemetry, display, sim: { ...s.sim, telemetry } };
}

/**
 * Drives the simulation clock. Mount this once per page — the store is a
 * module singleton, so a second mount would double the tick rate.
 */
export function useRaceClock() {
  useEffect(() => {
    const id = window.setInterval(() => {
      const { running, speedMultiplier, tick, telemetry } = useRaceStore.getState();
      if (!running || telemetry.status !== "live") return;
      tick((TICK_MS / 1000) * speedMultiplier);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);
}

/**
 * Reads from the rendered snapshot (feedback/round-01 D2). Every dashboard
 * widget must go through this rather than touching `telemetry`, so that one
 * painted frame is one tick.
 */
export function useSnapshot<T>(select: (frame: Telemetry) => T): T {
  return useRaceStore((s) => select(s.display));
}
