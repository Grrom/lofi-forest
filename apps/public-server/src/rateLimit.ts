export interface RateLimiterOptions {
  capacity?: number;
  refillRate?: number; // tokens per second
  now?: () => number;
}

export class RateLimiter {
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly now: () => number;
  private tokens: number;
  private lastRefillTime: number;

  constructor(options?: RateLimiterOptions) {
    this.capacity = options?.capacity ?? 25;
    this.refillRate = options?.refillRate ?? 15;
    this.now = options?.now ?? (() => Date.now());
    this.tokens = this.capacity;
    this.lastRefillTime = this.now();
  }

  consume(tokensToConsume = 1): boolean {
    const currentTime = this.now();
    const elapsedMs = Math.max(0, currentTime - this.lastRefillTime);
    this.lastRefillTime = currentTime;

    // Refill tokens: elapsedMs / 1000 * refillRate
    this.tokens = Math.min(
      this.capacity,
      this.tokens + (elapsedMs / 1000) * this.refillRate
    );

    if (this.tokens >= tokensToConsume) {
      this.tokens -= tokensToConsume;
      return true;
    }

    return false;
  }

  getTokens(): number {
    return this.tokens;
  }
}
