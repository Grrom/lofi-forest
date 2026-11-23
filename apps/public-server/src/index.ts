import http from 'node:http';
import { WebSocketServer } from 'ws';

export interface ServerInstance {
  server: http.Server;
  wss: WebSocketServer;
  port: number;
  close: () => Promise<void>;
}

export function createServer() {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  return { server, wss };
}

export function startServer(
  port = Number(process.env.PORT) || 8080,
  host = '0.0.0.0'
): Promise<ServerInstance> {
  const { server, wss } = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        server,
        wss,
        port: actualPort,
        close: () =>
          new Promise<void>((resClose, rejClose) => {
            wss.close(() => {
              server.close((err) => (err ? rejClose(err) : resClose()));
            });
          }),
      });
    });
  });
}

const isDirectRun =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1].endsWith('index.ts') ||
    process.argv[1].endsWith('index.js'));

if (isDirectRun && !process.env.VITEST) {
  const port = Number(process.env.PORT) || 8080;
  const host = '0.0.0.0';
  startServer(port, host).then(({ port }) => {
    console.log(`Public server listening on http://${host}:${port}`);
  });
}
