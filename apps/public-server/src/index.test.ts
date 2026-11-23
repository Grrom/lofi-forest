import { describe, it, expect } from 'vitest';
import { startServer } from './index.js';

describe('public-server health endpoint', () => {
  // Acceptance criterion: Test: GET /health returns 200 with {ok:true}.
  it('GET /health returns 200 with {ok:true}', async () => {
    const instance = await startServer(0, '127.0.0.1');
    try {
      const response = await fetch(`http://127.0.0.1:${instance.port}/health`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ ok: true });
    } finally {
      await instance.close();
    }
  });
});
