"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_TRACK_KEY } from "@/lib/track";
import { centerFor } from "@/lib/frame";

interface TracePoint {
  lat: number;
  lon: number;
  ts: number;
  speed: number;
}

export default function TrackTracePage() {
  const [tracePoints, setTracePoints] = useState<TracePoint[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const traceLineRef = useRef<google.maps.Polyline | null>(null);
  const carMarkerRef = useRef<google.maps.Marker | null>(null);

  const trackKey = DEFAULT_TRACK_KEY;
  const center = centerFor(trackKey);

  useEffect(() => {
    const wsUrl =
      typeof window !== "undefined"
        ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
        : "ws://localhost:4000";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "trace_point") {
          setTracePoints((prev) => [...prev, msg.point]);
        }
      } catch {}
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    if (tracePoints.length < 2) return;

    if (!mapRef.current) {
      const map = new google.maps.Map(containerRef.current!, {
        center: { lat: tracePoints[0].lat, lng: tracePoints[0].lon },
        zoom: 17,
        mapTypeId: "satellite",
        disableDefaultUI: true,
        zoomControl: true,
      });
      mapRef.current = map;

      traceLineRef.current = new google.maps.Polyline({
        path: [],
        geodesic: false,
        strokeColor: "#00E676",
        strokeOpacity: 0.9,
        strokeWeight: 4,
        map,
      });

      carMarkerRef.current = new google.maps.Marker({
        position: { lat: tracePoints[0].lat, lng: tracePoints[0].lon },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#00E676",
          fillOpacity: 1,
          strokeColor: "#000",
          strokeWeight: 2,
        },
      });
    }

    const path = tracePoints.map((p) => ({ lat: p.lat, lng: p.lon }));
    traceLineRef.current?.setPath(path);
    const last = tracePoints[tracePoints.length - 1];
    carMarkerRef.current?.setPosition({ lat: last.lat, lng: last.lon });

    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    mapRef.current?.fitBounds(bounds, 40);
  }, [tracePoints]);

  const totalDistance = tracePoints.reduce((sum, p, i) => {
    if (i === 0) return 0;
    const prev = tracePoints[i - 1];
    const dx = (p.lon - prev.lon) * 111320 * Math.cos((center.lat * Math.PI) / 180);
    const dy = (p.lat - prev.lat) * 110540;
    return sum + Math.sqrt(dx * dx + dy * dy);
  }, 0);

  return (
    <main className="flex min-h-dvh flex-col bg-pit-bg p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-[16px] tracking-[0.14em] text-ink uppercase">
          Track &amp; Trace
        </h1>
        <span className={`flex items-center gap-1.5 text-[11px] ${wsConnected ? "text-status-ok" : "text-status-crit"}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${wsConnected ? "bg-status-ok" : "bg-status-crit"}`} />
          {wsConnected ? "Connected" : "Disconnected"}
        </span>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div
            ref={containerRef}
            className="h-full min-h-[400px] rounded-md border border-pit-border overflow-hidden"
            style={{ display: tracePoints.length > 0 ? "block" : "none" }}
          />
          {tracePoints.length === 0 && (
            <div className="flex h-full min-h-[400px] items-center justify-center rounded-md border border-pit-border bg-pit-panel">
              <div className="text-center">
                <p className="text-[14px] text-ink-secondary">Waiting for GPS trace from mobile app</p>
                <p className="mt-2 text-[12px] text-ink-muted">
                  Open the RaceMind app and start tracing a track
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-md border border-pit-border bg-pit-panel p-3">
            <h2 className="text-[12px] tracking-[0.12em] text-ink-muted uppercase">Trace Stats</h2>
            <dl className="mt-2 space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-ink-secondary">Points</dt>
                <dd className="tnum text-ink">{tracePoints.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-secondary">Distance</dt>
                <dd className="tnum text-ink">{(totalDistance / 1000).toFixed(3)} km</dd>
              </div>
              {tracePoints.length > 0 && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-ink-secondary">Lat</dt>
                    <dd className="tnum text-ink">{tracePoints[tracePoints.length - 1].lat.toFixed(6)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-secondary">Lon</dt>
                    <dd className="tnum text-ink">{tracePoints[tracePoints.length - 1].lon.toFixed(6)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-secondary">Speed</dt>
                    <dd className="tnum text-ink">{tracePoints[tracePoints.length - 1].speed.toFixed(1)} km/h</dd>
                  </div>
                </>
              )}
            </dl>
          </div>

          <div className="rounded-md border border-pit-border bg-pit-panel p-3">
            <h2 className="text-[12px] tracking-[0.12em] text-ink-muted uppercase">Instructions</h2>
            <ol className="mt-2 space-y-1.5 text-[12px] text-ink-secondary">
              <li>1. Open RaceMind app on phone</li>
              <li>2. Go to Track &amp; Trace tab</li>
              <li>3. Press Start Tracing</li>
              <li>4. Walk/drive the track path</li>
              <li>5. Press Stop when back at start</li>
              <li>6. Track appears here live</li>
            </ol>
          </div>

          {tracePoints.length > 0 && (
            <button
              onClick={() => {
                setTracePoints([]);
                mapRef.current = null;
                if (containerRef.current) containerRef.current.innerHTML = "";
              }}
              className="w-full rounded border border-status-crit px-3 py-1.5 text-[11px] text-ink-secondary hover:bg-pit-panel"
            >
              Clear Trace
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
