"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createSimState, SimState, step } from "./simulation";
import { DEFAULT_TRACK_KEY } from "./track";
import { Compound, Telemetry } from "./types";

/** Wall-clock tick rate. Matches the 10 Hz phone packet rate. */
const TICK_MS = 100;

interface RaceStore {
  sim: SimState;
  telemetry: Telemetry;
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

export const useRaceStore = create<RaceStore>((set, get) => ({
  sim: initial,
  telemetry: initial.telemetry,
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
    set({ sim, telemetry: sim.telemetry });
  },

  setSpeedMultiplier: (speedMultiplier) => set({ speedMultiplier }),
  toggleRunning: () => set((s) => ({ running: !s.running })),

  reset: () => {
    const fresh = createSimState(get().trackKey);
    set({ sim: fresh, telemetry: fresh.telemetry, running: true });
  },

  // Changing track restarts the race — the physics state is track-specific.
  setTrack: (key) => {
    const fresh = createSimState(key);
    set({ sim: fresh, telemetry: fresh.telemetry, trackKey: key, running: true });
  },

  approveAlert: (id, message) =>
    set((s) => {
      const telemetry: Telemetry = {
        ...s.telemetry,
        alerts: s.telemetry.alerts.map((a) =>
          a.id === id
            ? { ...a, status: "sent" as const, message: message ?? a.message }
            : a,
        ),
      };
      return { telemetry, sim: { ...s.sim, telemetry } };
    }),

  dismissAlert: (id) =>
    set((s) => {
      const telemetry: Telemetry = {
        ...s.telemetry,
        alerts: s.telemetry.alerts.map((a) =>
          a.id === id ? { ...a, status: "dismissed" as const } : a,
        ),
      };
      return { telemetry, sim: { ...s.sim, telemetry } };
    }),

  pitStop: (compound) =>
    set((s) => {
      const t = s.telemetry;
      const telemetry: Telemetry = {
        ...t,
        tyres: {
          ...t.tyres,
          compound,
          wearPct: 0,
          gripLevel: 1,
          ageLaps: 0,
          temps: { fl: 78, fr: 80, rl: 76, rr: 77 },
        },
        strategy: { ...t.strategy, stintLap: 0 },
        agentMessages: [
          {
            id: `gemma-pit-${t.lap}`,
            lap: t.lap,
            text: `Box confirmed. ${compound.toUpperCase()} fitted on lap ${t.lap}. Two laps to build temperature — push T1 to T4.`,
            createdAt: 0,
          },
          ...t.agentMessages,
        ].slice(0, 20),
      };
      return { telemetry, sim: { ...s.sim, telemetry } };
    }),
}));

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
