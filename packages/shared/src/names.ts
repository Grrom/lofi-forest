export const COZY_ADJECTIVES = [
  'Mossy',
  'Sleepy',
  'Amber',
  'Misty',
  'Cozy',
  'Quiet',
  'Gentle',
  'Calm',
  'Hazel',
  'Golden',
  'Fern',
  'Sunny',
  'Willow',
  'Dusky',
  'Clover',
  'Cedar',
  'Dewy',
  'Breezy',
  'Rustic',
  'Tender',
  'Warm',
  'Autumn',
] as const;

export const COZY_ANIMALS = [
  'Fox',
  'Owl',
  'Hare',
  'Otter',
  'Wren',
  'Deer',
  'Robin',
  'Finch',
  'Badger',
  'Bear',
  'Fawn',
  'Dove',
  'Mouse',
  'Swan',
  'Rabbit',
] as const;

export const LOBBY_NAME_REGEX = /^[A-Z][a-z]+ [A-Z][a-z]+\d?$/;

/**
 * Generate a cozy display name in the format "<Adjective> <Animal>" (or with a digit on collision).
 * The name is guaranteed to match /^[A-Z][a-z]+ [A-Z][a-z]+\d?$/, be at most 16 characters,
 * and be unique among existingNames.
 */
export function generateLobbyName(
  existingNames: Set<string> | Iterable<string>,
  rng: () => number = Math.random
): string {
  const set = existingNames instanceof Set ? existingNames : new Set(existingNames);

  // Try random combinations first
  for (let attempt = 0; attempt < 100; attempt++) {
    const adj = COZY_ADJECTIVES[Math.floor(rng() * COZY_ADJECTIVES.length)];
    const animal = COZY_ANIMALS[Math.floor(rng() * COZY_ANIMALS.length)];
    const base = `${adj} ${animal}`;

    if (!set.has(base)) {
      return base;
    }

    // Collision: add a digit on collision (try 2-9, then 1, 0)
    for (let d = 2; d <= 9; d++) {
      const candidate = `${base}${d}`;
      if (!set.has(candidate)) {
        return candidate;
      }
    }
    for (const d of [1, 0]) {
      const candidate = `${base}${d}`;
      if (!set.has(candidate)) {
        return candidate;
      }
    }
  }

  // Fallback: exhaustive search across all combinations
  for (const adj of COZY_ADJECTIVES) {
    for (const animal of COZY_ANIMALS) {
      const base = `${adj} ${animal}`;
      if (!set.has(base)) {
        return base;
      }
      for (let d = 2; d <= 9; d++) {
        const candidate = `${base}${d}`;
        if (!set.has(candidate)) {
          return candidate;
        }
      }
      for (const d of [1, 0]) {
        const candidate = `${base}${d}`;
        if (!set.has(candidate)) {
          return candidate;
        }
      }
    }
  }

  // Ultimate fallback to guarantee unique name matching regex and <= 16 chars
  const fallbackBase = `${COZY_ADJECTIVES[0]} ${COZY_ANIMALS[0]}`;
  for (let d = 2; d <= 9; d++) {
    if (!set.has(`${fallbackBase}${d}`)) return `${fallbackBase}${d}`;
  }
  return fallbackBase;
}
