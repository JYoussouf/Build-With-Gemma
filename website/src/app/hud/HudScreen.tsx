"use client";

import { Hud } from "@/components/hud/Hud";
import { useRaceClock } from "@/lib/store";

export function HudScreen() {
  useRaceClock();
  return <Hud />;
}
