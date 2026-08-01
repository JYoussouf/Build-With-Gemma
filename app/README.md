# RaceMind Driver App

Flutter (Dart) app targeting Android. This is the **car**: a sensor relay that
streams GPS + IMU + barometer to the backend at 10 Hz and speaks Gemma's calls
aloud to the driver.

Full specification: [`../docs/mobile-app.md`](../docs/mobile-app.md).

## Status

Not scaffolded yet. The HUD (Screen 3) has a browser reference implementation at
[`../website/src/components/hud/Hud.tsx`](../website/src/components/hud/Hud.tsx)
— layout, alert tiers, and gauge thresholds there are the spec the Flutter
screen should match.

## Planned structure

```
app/
  lib/
    main.dart
    screens/
      connect_calibrate.dart   # Screen 1 — race select, IMU calibration
      trace_track.dart         # Screen 2 — walk the track, submit GPS trace
      racer_hud.dart           # Screen 3 — the live HUD, audio-first
      pit_stop.dart            # Screen 4 — compound selection
    services/
      sensors.dart             # sensors_plus + geolocator, axis remapping
      telemetry_socket.dart    # web_socket_channel client + offline buffer
      tts.dart                 # flutter_tts priority queue
    models/
  pubspec.yaml
```

## Getting started (once scaffolded)

```bash
flutter create --org app.racemind --platforms=android .
flutter pub add sensors_plus geolocator web_socket_channel flutter_tts hive
flutter run
```

## Key requirements from the spec

- GPS at 10 Hz in high-accuracy mode; IMU at 50 Hz, downsampled to 10 Hz for transmission
- Axis remapping per phone orientation (pocket / hand / armband)
- Offline buffer of ~60 s of packets, replayed in order on reconnect
- TTS is a core feature, not a stretch goal: every alert is spoken immediately,
  with critical alerts interrupting whatever is currently being said
- Foreground service so streaming survives a screen-off pocket
