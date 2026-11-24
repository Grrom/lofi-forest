import { describe, it, expect } from 'vitest';
import { generateRoomCode, ROOM_CODE_WORDS } from './roomCode';

describe('roomCode generator', () => {
  // Acceptance criterion:
  // Test: the generated code matches /^[a-z]+-\d{3}$/.
  it('the generated code matches /^[a-z]+-\\d{3}$/', () => {
    const codeRegex = /^[a-z]+-\d{3}$/;

    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(codeRegex);

      const [word, digits] = code.split('-');
      expect(ROOM_CODE_WORDS).toContain(word);
      expect(digits).toHaveLength(3);
      expect(Number(digits)).toBeGreaterThanOrEqual(0);
      expect(Number(digits)).toBeLessThan(1000);
    }
  });
});
