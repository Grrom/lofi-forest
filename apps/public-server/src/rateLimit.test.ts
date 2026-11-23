import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rateLimit.js';

describe('rateLimit', () => {
  // Acceptance criterion:
  // Tests (rate limiter): 25 immediate messages pass and the 26th fails; after 1 s, 15 more pass.
  it('Tests (rate limiter): 25 immediate messages pass and the 26th fails; after 1 s, 15 more pass.', () => {
    let simulatedTime = 10000;
    const limiter = new RateLimiter({
      capacity: 25,
      refillRate: 15,
      now: () => simulatedTime,
    });

    // 25 immediate messages pass
    for (let i = 0; i < 25; i++) {
      expect(limiter.consume()).toBe(true);
    }

    // 26th fails
    expect(limiter.consume()).toBe(false);

    // After 1 s, 15 more pass
    simulatedTime += 1000;

    for (let i = 0; i < 15; i++) {
      expect(limiter.consume()).toBe(true);
    }

    // 16th fails
    expect(limiter.consume()).toBe(false);
  });
});
