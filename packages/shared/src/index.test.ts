import { describe, it, expect } from 'vitest';
import { PLACEHOLDER } from './index.js';

describe('@lofi/shared', () => {
  it('exports placeholder constant', () => {
    expect(PLACEHOLDER).toBe('lofi-forest');
  });
});
