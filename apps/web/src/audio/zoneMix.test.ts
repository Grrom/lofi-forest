import { describe, it, expect } from 'vitest';
import { zoneMix, ZONE_MIX_TABLE } from './zoneMix';

describe('zoneMix', () => {
  // Acceptance criterion:
  // Tests: zoneMix returns the table above, and the pub enables the rain low-pass.
  it('zoneMix returns the table above, and the pub enables the rain low-pass', () => {
    // Forest: forest 1, campfire 0.6, rain 0, pub 0, rainLowPass: false
    const forestMix = zoneMix('forest');
    expect(forestMix.forest).toBe(1);
    expect(forestMix.campfire).toBe(0.6);
    expect(forestMix.rain).toBe(0);
    expect(forestMix.pub).toBe(0);
    expect(forestMix.rainLowPass).toBe(false);
    expect(forestMix.rainFilterCutoff).toBe(20000);

    // Lake: rain 1, forest 0.4, campfire 0, pub 0, rainLowPass: false
    const lakeMix = zoneMix('lake');
    expect(lakeMix.rain).toBe(1);
    expect(lakeMix.forest).toBe(0.4);
    expect(lakeMix.campfire).toBe(0);
    expect(lakeMix.pub).toBe(0);
    expect(lakeMix.rainLowPass).toBe(false);
    expect(lakeMix.rainFilterCutoff).toBe(20000);

    // Pub: pub 1, campfire 1, rain 0.35 through a 900 Hz low-pass, forest 0
    const pubMix = zoneMix('pub');
    expect(pubMix.pub).toBe(1);
    expect(pubMix.campfire).toBe(1);
    expect(pubMix.rain).toBe(0.35);
    expect(pubMix.forest).toBe(0);
    expect(pubMix.rainLowPass).toBe(true);
    expect(pubMix.rainFilterCutoff).toBe(900);
  });
});
