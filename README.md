# RaceMind

Real-time, on-edge racing intelligence that syncs alerts between racer and engineering team - cutting comms time to zero.

## Repository layout

| Path       | What it is                                                                             |
| ---------- | -------------------------------------------------------------------------------------- |
| `docs/`    | Specifications: telemetry models, alert system, data flow, database schema, UI layouts   |
| `data/`    | Shared JSON both clients read: tracks, config, schemas, sample and simulated telemetry   |
| `website/` | Next.js pit wall — engineer dashboard and a browser rendering of the driver HUD          |
| `app/`     | Flutter driver app (not scaffolded yet; see `app/README.md`)                             |
| `tools/`   | Track generator tooling                                                                  |

## Quick start

```bash
cd website
npm install
npm run dev
```

Then open [localhost:3000/dashboard](http://localhost:3000/dashboard) for the pit wall
and [localhost:3000/hud](http://localhost:3000/hud) for the driver HUD.
Both run against a client-side telemetry simulator, so no backend is needed yet.
See [`website/README.md`](website/README.md) for what the simulator models and where the real backend plugs in.
