import type { ZoneId } from '@lofi/shared';

export type AmbientChannel = 'forest' | 'campfire' | 'rain' | 'pub';

export interface ZoneMixResult {
  forest: number;
  campfire: number;
  rain: number;
  pub: number;
  rainLowPass: boolean;
  rainFilterCutoff: number;
}

export const ZONE_MIX_TABLE: Record<ZoneId, ZoneMixResult> = {
  forest: {
    forest: 1,
    campfire: 0.6,
    rain: 0,
    pub: 0,
    rainLowPass: false,
    rainFilterCutoff: 20000,
  },
  lake: {
    rain: 1,
    forest: 0.4,
    campfire: 0,
    pub: 0,
    rainLowPass: false,
    rainFilterCutoff: 20000,
  },
  pub: {
    pub: 1,
    campfire: 1,
    rain: 0.35,
    forest: 0,
    rainLowPass: true,
    rainFilterCutoff: 900,
  },
};

/**
 * Pure zoneMix(zone) returns the mix gains and rain low-pass state for a given zone:
 * - forest: forest 1, campfire 0.6, rain 0, pub 0
 * - lake: rain 1, forest 0.4, campfire 0, pub 0
 * - pub: pub 1, campfire 1, rain 0.35 through a 900 Hz low-pass, forest 0
 */
export function zoneMix(zone: ZoneId): ZoneMixResult {
  return ZONE_MIX_TABLE[zone] ?? ZONE_MIX_TABLE.forest;
}
