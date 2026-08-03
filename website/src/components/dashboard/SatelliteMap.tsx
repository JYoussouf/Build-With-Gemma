"use client";

import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { TrackDiagram } from "@/components/dashboard/TrackDiagram";
import { pointAt, Track } from "@/lib/track";
import { centerFor, toLatLon } from "@/lib/frame";

let mapsLoaded = false;

/**
 * The satellite view needs a Google Maps key, and a deployment without one is
 * the normal case rather than a fault: the key is billable and per-account, so
 * anyone running this from a clone has none. When it is missing the panel
 * falls back to TrackDiagram, which draws the same circuit over the same
 * streets from `/data` and needs no third party at all. Previously this state
 * rendered "Map unavailable - check API key", which read as something broken
 * when nothing was.
 */
async function loadMaps(): Promise<void> {
  if (mapsLoaded) return;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) {
    throw new Error("no NEXT_PUBLIC_GOOGLE_MAPS_KEY");
  }
  setOptions({ key, v: "weekly" });
  await importLibrary("maps");
  mapsLoaded = true;
}

interface SatelliteMapProps {
  track: Track;
  trackKey: string;
  carPos: number;
  className?: string;
  showCar?: boolean;
  height?: string;
}

export function SatelliteMap({
  track,
  trackKey,
  carPos,
  className,
  showCar = true,
  height = "100%",
}: SatelliteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const trackPathRef = useRef<google.maps.Polyline | null>(null);
  const carMarkerRef = useRef<google.maps.Marker | null>(null);
  const sectorMarkersRef = useRef<google.maps.Marker[]>([]);
  const initRef = useRef(false);

  const center = centerFor(trackKey);
  const trackPoints = track.points.map((p) => {
    const ll = toLatLon(p.x, p.y, center);
    return { lat: ll.lat, lng: ll.lon };
  });

  useEffect(() => {
    if (!containerRef.current || initRef.current) return;

    let cancelled = false;

    loadMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const map = new google.maps.Map(containerRef.current, {
          center: { lat: center.lat, lng: center.lon },
          zoom: 16,
          mapTypeId: "satellite",
          tilt: 0,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          mapTypeControl: true,
          mapTypeControlOptions: {
            style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
            mapTypeIds: ["satellite", "hybrid", "roadmap"],
          },
        });

        mapRef.current = map;
        initRef.current = true;

        const bounds = new google.maps.LatLngBounds();
        trackPoints.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, 60);

        const trackLine = new google.maps.Polyline({
          path: trackPoints,
          geodesic: false,
          strokeColor: "#E53935",
          strokeOpacity: 0.9,
          strokeWeight: 4,
          map,
        });
        trackPathRef.current = trackLine;

        const sfPoint = trackPoints[0];
        new google.maps.Marker({
          position: sfPoint,
          map,
          label: { text: "S/F", color: "#FFFFFF", fontSize: "10px", fontWeight: "bold" },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#000000",
            fillOpacity: 1,
            strokeColor: "#FFFFFF",
            strokeWeight: 2,
          },
        });

        const sectorColors = ["#FFD700", "#00E676", "#00B0FF"];
        const sectorLabels = ["S2", "S3"];
        sectorLabels.forEach((label, i) => {
          const idx = Math.floor(track.sectorSplits[i] * trackPoints.length);
          if (trackPoints[idx]) {
            const m = new google.maps.Marker({
              position: trackPoints[idx],
              map,
              label: { text: label, color: "#FFFFFF", fontSize: "9px" },
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: sectorColors[i + 1],
                fillOpacity: 1,
                strokeColor: "#000000",
                strokeWeight: 1,
              },
            });
            sectorMarkersRef.current.push(m);
          }
        });

        if (showCar) {
          const carPoint = trackPoints[0];
          const carMarker = new google.maps.Marker({
            position: carPoint,
            map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: "#00E676",
              fillOpacity: 1,
              strokeColor: "#000000",
              strokeWeight: 2,
            },
          });
          carMarkerRef.current = carMarker;
        }
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, [trackKey]);

  useEffect(() => {
    if (!carMarkerRef.current) return;
    const p = pointAt(track, carPos);
    const ll = toLatLon(p.x, p.y, center);
    carMarkerRef.current.setPosition({ lat: ll.lat, lng: ll.lon });
  }, [carPos, track, center]);

  if (unavailable) {
    return (
      <TrackDiagram
        track={track}
        carPos={showCar ? carPos : undefined}
        className={className ?? "w-full"}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={className ?? "w-full"}
      style={{ height, minHeight: "200px", borderRadius: "4px", overflow: "hidden" }}
    />
  );
}
