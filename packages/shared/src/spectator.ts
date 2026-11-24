import type { ZoneId } from './types.js';

export interface SpectatorParams {
  spectator: boolean;
  zone: ZoneId;
  hideNames: boolean;
  overlay: boolean;
  focusMin: number;
  breakMin: number;
}

export function parseSpectatorParams(
  search?: string | URLSearchParams | null
): SpectatorParams {
  let params: URLSearchParams;
  if (!search) {
    if (typeof window !== 'undefined' && window.location?.search) {
      params = new URLSearchParams(window.location.search);
    } else {
      params = new URLSearchParams('');
    }
  } else if (typeof search === 'string') {
    const q = search.startsWith('?') ? search.slice(1) : search;
    params = new URLSearchParams(q);
  } else {
    params = search;
  }

  const mode = params.get('mode');
  const spectatorParam = params.get('spectator');
  const spectator =
    mode === 'spectator' || spectatorParam === '1' || spectatorParam === 'true';

  const rawZone = params.get('zone');
  const zone: ZoneId =
    rawZone === 'forest' || rawZone === 'lake' || rawZone === 'pub'
      ? rawZone
      : 'forest';

  const hideNamesParam = params.get('hideNames');
  const hideNames = hideNamesParam === '1' || hideNamesParam === 'true';

  const overlayParam = params.get('overlay');
  const overlay = overlayParam === '1' || overlayParam === 'true';

  let focusMin = 50;
  let breakMin = 10;
  const pomo = params.get('pomo');
  if (pomo) {
    const match = /^(\d+)-(\d+)$/.exec(pomo.trim());
    if (match) {
      const f = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);
      if (f >= 1 && f <= 180 && b >= 1 && b <= 60) {
        focusMin = f;
        breakMin = b;
      }
    }
  }

  return {
    spectator,
    zone,
    hideNames,
    overlay,
    focusMin,
    breakMin,
  };
}

export interface EpochCycleResult {
  phase: 'focus' | 'break';
  endsAtMs: number;
}

export function epochCycle(
  nowMs: number,
  focusMin = 50,
  breakMin = 10
): EpochCycleResult {
  const cycleMs = (focusMin + breakMin) * 60000;
  const focusMs = focusMin * 60000;
  const pos = ((nowMs % cycleMs) + cycleMs) % cycleMs;
  const cycleStart = nowMs - pos;

  if (pos < focusMs) {
    return {
      phase: 'focus',
      endsAtMs: cycleStart + focusMs,
    };
  } else {
    return {
      phase: 'break',
      endsAtMs: cycleStart + cycleMs,
    };
  }
}
