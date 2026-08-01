# RaceMind Website (Pit Wall)

Next.js 15 App Router + TypeScript + Tailwind v4 + Zustand.
Specification: [`../docs/website-dashboard.md`](../docs/website-dashboard.md).

## Run

```bash
npm install
npm run dev     # http://localhost:3000
```

Node 20+ required.

## Routes

| Route        | What it is                                                              |
| ------------ | ----------------------------------------------------------------------- |
| `/`          | Index of what is built and what is not                                   |
| `/dashboard` | View 4 — Live Race Dashboard, three columns, engineer control panel      |
| `/hud`       | Driver HUD (mobile app Screen 3) rendered at phone width in the browser  |

Views 1-3 (Track Setup, Race Configuration, Pre-Race Report) are not built yet.

## The simulator

There is no backend yet, so `src/lib/simulation.ts` stands in for the whole
pipeline described in `docs/data-flow.md` (phone sensors → physics models →
Redis → WebSocket). It runs a synthetic car around a synthetic track and applies
the same models the backend will:

| Model      | Drives                                                        |
| ---------- | ------------------------------------------------------------- |
| Driver     | Target speed from track curvature, braking on corner approach  |
| Fuel       | Flow rate from speed², throttle, cornering load, wind, compound |
| Tyre wear  | Lateral load + speed + track temp, with a grip cliff past 62%   |
| Tyre temp  | Per corner — outer tyres in a corner, fronts under braking      |
| Brake temp | Per corner, front-biased, cooled by airflow                     |
| ERS        | Harvest under braking, deploy on throttle, 4 MJ store           |

It is fully deterministic — no `Date.now()`, no `Math.random()` — so the
server-rendered frame matches the client's and there are no hydration errors.

Top-bar controls: 1x / 4x / 16x time compression, pause, reset. 4x is the
default so a lap takes about 20 seconds.

### Alert tiers

The alert system (`docs/alert-system.md`) is wired end to end:

- **2a** preventative rules and **2b** signal patterns fire automatically and
  land on the HUD immediately
- **2c** anomalies queue in the engineer panel as **pending**. Approve, modify
  the driver-facing wording, or dismiss. Only approved ones reach `/hud`, tagged
  `[2c] ✓ VERIFIED`

Open `/dashboard` and `/hud` in two windows to watch the handoff — note that
each tab runs its own simulator instance, so they are independent races until
the WebSocket backend lands.

## Swapping in the real backend

`src/lib/store.ts` is the seam. Replace `useRaceClock`'s interval with a
WebSocket subscription that calls `set({ telemetry })` on each frame, and the
components are unchanged. `src/lib/types.ts` mirrors the Redis hot-state shape.

`src/components/dashboard/TrackMap.tsx` is a 2D SVG placeholder for the Google
Photorealistic 3D map (`Map3DElement`); replacing it touches nothing else.

## Design rules

From the spec's pit-wall theme: typography and UI edges are strictly
white/grey. Colour only ever carries data meaning — status dots, gauge fills,
compound badges — never headings, links, borders, or body text.
