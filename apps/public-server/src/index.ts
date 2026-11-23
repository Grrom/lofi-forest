export * from './rateLimit.js';
export * from './server.js';

import { startServer } from './server.js';

const isDirectRun =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1].endsWith('index.ts') ||
    process.argv[1].endsWith('index.js'));

if (isDirectRun && !process.env.VITEST) {
  const port = Number(process.env.PORT) || 8080;
  const host = process.env.HOST || '0.0.0.0';
  startServer(port, host).then(({ port }) => {
    console.log(`Public server listening on http://${host}:${port}`);
  });
}
