import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@lofi/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      'trystero/nostr': resolve(__dirname, 'src/net/trystero.ts'),
    },
  },
  build: {
    assetsDir: 'static',
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
