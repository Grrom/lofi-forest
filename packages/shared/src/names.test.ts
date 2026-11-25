import { describe, it, expect } from 'vitest';
import {
  COZY_ADJECTIVES,
  COZY_ANIMALS,
  LOBBY_NAME_REGEX,
  generateLobbyName,
} from './names.js';

describe('names module', () => {
  it('every adjective and animal matches regex word pattern and stays within 16 chars when combined', () => {
    for (const adj of COZY_ADJECTIVES) {
      expect(adj).toMatch(/^[A-Z][a-z]+$/);
    }
    for (const animal of COZY_ANIMALS) {
      expect(animal).toMatch(/^[A-Z][a-z]+$/);
    }

    for (const adj of COZY_ADJECTIVES) {
      for (const animal of COZY_ANIMALS) {
        const base = `${adj} ${animal}`;
        expect(base).toMatch(LOBBY_NAME_REGEX);
        expect(base.length).toBeLessThanOrEqual(16);
        const withDigit = `${base}2`;
        expect(withDigit).toMatch(LOBBY_NAME_REGEX);
        expect(withDigit.length).toBeLessThanOrEqual(16);
      }
    }
  });

  it('generates a valid cozy lobby name with no collisions', () => {
    const existing = new Set<string>();
    const name = generateLobbyName(existing);
    expect(name).toMatch(LOBBY_NAME_REGEX);
    expect(name.length).toBeLessThanOrEqual(16);
  });

  it('adds a digit on collision and ensures uniqueness', () => {
    const existing = new Set<string>(['Mossy Fox']);
    // Force rng to pick 0 (first adjective "Mossy" and first animal "Fox")
    const mockRng = () => 0;
    const name2 = generateLobbyName(existing, mockRng);
    expect(name2).toBe('Mossy Fox2');
    expect(name2).toMatch(LOBBY_NAME_REGEX);
    expect(name2.length).toBeLessThanOrEqual(16);

    existing.add(name2);
    const name3 = generateLobbyName(existing, mockRng);
    expect(name3).toBe('Mossy Fox3');
    expect(name3).toMatch(LOBBY_NAME_REGEX);
  });

  it('generates 50 unique names without any duplicate', () => {
    const existing = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const name = generateLobbyName(existing);
      expect(existing.has(name)).toBe(false);
      expect(name).toMatch(LOBBY_NAME_REGEX);
      expect(name.length).toBeLessThanOrEqual(16);
      existing.add(name);
    }
    expect(existing.size).toBe(50);
  });
});
