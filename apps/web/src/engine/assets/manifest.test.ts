import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMOTE_IDS, HAT_IDS } from '@lofi/shared';
import type { AssetManifest } from '@lofi/shared';

describe('Asset Manifest & Licenses', () => {
  const manifestPath = resolve(__dirname, '../../../public/assets/manifest.json');
  const licensesPath = resolve(__dirname, '../../../public/assets/LICENSES.md');

  // Acceptance criterion:
  // Test: manifest.json parses, has every key listed above, and every src is under /assets/.
  it('manifest.json parses, has every key listed above, and every src is under /assets/', () => {
    expect(existsSync(manifestPath)).toBe(true);
    const content = readFileSync(manifestPath, 'utf-8');
    const manifest: AssetManifest = JSON.parse(content);

    // Sprites keys
    expect(manifest.sprites).toBeDefined();
    expect(manifest.sprites.tileset_forest).toBeDefined();
    expect(manifest.sprites.char_base).toBeDefined();
    expect(Array.isArray(manifest.sprites.hats)).toBe(true);
    expect(manifest.sprites.emotes).toBeDefined();

    // Verify hats: none, beanie, cap, flower
    const hatIds = manifest.sprites.hats.map((h) => h.id);
    expect(hatIds).toContain('none');
    expect(hatIds).toContain('beanie');
    expect(hatIds).toContain('cap');
    expect(hatIds).toContain('flower');

    // Verify emotes: all 6 EmoteIds
    expect(EMOTE_IDS).toHaveLength(6);
    for (const emoteId of EMOTE_IDS) {
      expect(manifest.sprites.emotes[emoteId]).toBeDefined();
    }

    // Audio keys
    expect(manifest.audio).toBeDefined();
    expect(Array.isArray(manifest.audio.bgm)).toBe(true);
    expect(manifest.audio.ambience).toBeDefined();
    expect(manifest.audio.sfx).toBeDefined();

    // Ambience: rain, campfire, forest, pub
    expect(manifest.audio.ambience.rain).toBeDefined();
    expect(manifest.audio.ambience.campfire).toBeDefined();
    expect(manifest.audio.ambience.forest).toBeDefined();
    expect(manifest.audio.ambience.pub).toBeDefined();

    // SFX: pomo_chime, teleport
    expect(manifest.audio.sfx.pomo_chime).toBeDefined();
    expect(manifest.audio.sfx.teleport).toBeDefined();

    // Every sprite entry has author and license fields
    expect(manifest.sprites.tileset_forest.author).toBeTruthy();
    expect(manifest.sprites.tileset_forest.license).toBeTruthy();
    expect(manifest.sprites.char_base.author).toBeTruthy();
    expect(manifest.sprites.char_base.license).toBeTruthy();

    for (const hat of manifest.sprites.hats) {
      expect(hat.author).toBeTruthy();
      expect(hat.license).toBeTruthy();
    }

    for (const emoteId of EMOTE_IDS) {
      const emote = manifest.sprites.emotes[emoteId];
      expect(emote.author).toBeTruthy();
      expect(emote.license).toBeTruthy();
    }

    // Every src is under /assets/
    const allSrcs: string[] = [
      manifest.sprites.tileset_forest.src,
      manifest.sprites.char_base.src,
      ...manifest.sprites.hats.map((h) => h.src),
      ...Object.values(manifest.sprites.emotes).map((e) => e.src),
      ...manifest.audio.bgm.map((b) => b.src),
      manifest.audio.ambience.rain.src,
      manifest.audio.ambience.campfire.src,
      manifest.audio.ambience.forest.src,
      manifest.audio.ambience.pub.src,
      manifest.audio.sfx.pomo_chime.src,
      manifest.audio.sfx.teleport.src,
    ];

    for (const src of allSrcs) {
      expect(src.startsWith('/assets/')).toBe(true);
    }

    // Audio BGM items have id, title, artist, src
    for (const bgm of manifest.audio.bgm) {
      expect(bgm.id).toBeTruthy();
      expect(bgm.title).toBeTruthy();
      expect(bgm.artist).toBeTruthy();
      expect(bgm.src).toBeTruthy();
      expect(bgm.src.startsWith('/assets/')).toBe(true);
    }
  });

  // Acceptance criterion:
  // LICENSES.md exists with the table header and the no-AI rule.
  it('LICENSES.md exists with the table header and the no-AI rule', () => {
    expect(existsSync(licensesPath)).toBe(true);
    const text = readFileSync(licensesPath, 'utf-8');

    // Table header columns
    expect(text).toMatch(/\|\s*Asset\s*\|\s*File\s*\|\s*Author\s*\|\s*Source URL\s*\|\s*License\s*\|\s*Purchase Date\s*\|/i);

    // No-AI rule check
    expect(text).toMatch(/no AI/i);
  });
});
