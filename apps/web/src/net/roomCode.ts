export const ROOM_CODE_WORDS = [
  'pine',
  'moss',
  'fern',
  'birch',
  'cedar',
  'maple',
  'willow',
  'acorn',
] as const;

export type RoomCodeWord = (typeof ROOM_CODE_WORDS)[number];

/**
 * Generates a <word>-<3 digits> room code matching /^[a-z]+-\d{3}$/.
 * Uses words: pine, moss, fern, birch, cedar, maple, willow, acorn.
 */
export function generateRoomCode(): string {
  const word = ROOM_CODE_WORDS[Math.floor(Math.random() * ROOM_CODE_WORDS.length)];
  const num = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `${word}-${num}`;
}
