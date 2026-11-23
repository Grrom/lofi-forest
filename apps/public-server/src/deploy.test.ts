import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

describe('Deployment and Docker Configuration', () => {
  // Acceptance criterion: The compose file has restart: unless-stopped, mem_limit: 256m, and a bind defaulting to 127.0.0.1 via LOBBY_BIND.
  it('The compose file has restart: unless-stopped, mem_limit: 256m, and a bind defaulting to 127.0.0.1 via LOBBY_BIND.', () => {
    const composePath = path.join(repoRoot, 'apps/public-server/docker-compose.yml');
    expect(fs.existsSync(composePath)).toBe(true);
    const content = fs.readFileSync(composePath, 'utf8');

    expect(content).toContain('services:');
    expect(content).toContain('lobby:');
    expect(content).toContain('restart: unless-stopped');
    expect(content).toContain('mem_limit: 256m');
    expect(content).toContain('env_file: .env');
    expect(content).toContain('"${LOBBY_BIND:-127.0.0.1}:8080:8080"');
  });

  // Acceptance criterion: The image runs as non-root and has a HEALTHCHECK.
  it('The image runs as non-root and has a HEALTHCHECK.', () => {
    const dockerfilePath = path.join(repoRoot, 'apps/public-server/Dockerfile');
    expect(fs.existsSync(dockerfilePath)).toBe(true);
    const content = fs.readFileSync(dockerfilePath, 'utf8');

    // Multi-stage node:22-alpine
    expect(content).toMatch(/FROM node:22-alpine/);
    // Builds with pnpm
    expect(content).toMatch(/corepack enable/);
    expect(content).toMatch(/pnpm/);
    // Non-root user
    expect(content).toMatch(/USER node/);
    // Port 8080 exposed
    expect(content).toMatch(/EXPOSE 8080/);
    // Healthcheck on /health
    expect(content).toMatch(/HEALTHCHECK/);
    expect(content).toMatch(/\/health/);
  });

  // Acceptance criterion: Both proxy examples exist.
  it('Both proxy examples exist.', () => {
    const caddyPath = path.join(repoRoot, 'deploy/Caddyfile.example');
    const nginxPath = path.join(repoRoot, 'deploy/nginx.conf.example');

    expect(fs.existsSync(caddyPath)).toBe(true);
    expect(fs.existsSync(nginxPath)).toBe(true);

    const caddyContent = fs.readFileSync(caddyPath, 'utf8');
    expect(caddyContent).toContain('reverse_proxy 127.0.0.1:8080');
    expect(caddyContent).toContain('tls');

    const nginxContent = fs.readFileSync(nginxPath, 'utf8');
    expect(nginxContent).toContain('proxy_pass http://127.0.0.1:8080;');
    expect(nginxContent).toContain('Upgrade');
    expect(nginxContent).toContain('Connection');
    expect(nginxContent).toMatch(/proxy_read_timeout\s+(?:7[5-9]|[8-9][0-9]|\d{3,})s;/);
  });

  // Acceptance criterion: The README has all three subsections with exact commands, including the warning about TRUST_CF_HEADER on direct exposure.
  it('The README has all three subsections with exact commands, including the warning about TRUST_CF_HEADER on direct exposure.', () => {
    const readmePath = path.join(repoRoot, 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);
    const content = fs.readFileSync(readmePath, 'utf8');

    // Subsection 1: Test on the server IP
    expect(content).toContain('1. Test on the server IP');
    expect(content).toContain('LOBBY_BIND=0.0.0.0');
    expect(content).toContain('TRUST_CF_HEADER=0');
    expect(content).toContain('docker compose up -d --build');
    expect(content).toContain('curl http://<ip>:8080/health');
    expect(content).toContain('VITE_PUBLIC_WS_URL=ws://<ip>:8080/ws pnpm --filter web dev');
    expect(content).toMatch(/warning.*TRUST_CF_HEADER/i);
    expect(content).toMatch(/https.*cannot.*ws:\/\//i);

    // Subsection 2: Test from the deployed site via a quick tunnel
    expect(content).toContain('2. Test from the deployed site via a quick tunnel');
    expect(content).toContain('LOBBY_BIND=127.0.0.1');
    expect(content).toContain('cloudflared tunnel --url http://localhost:8080');
    expect(content).toContain('VITE_PUBLIC_WS_URL=wss://<random>.trycloudflare.com/ws');
    expect(content).toContain('TRUST_CF_HEADER=1');
    expect(content).toMatch(/changes on every restart/i);

    // Subsection 3: Production with a domain
    expect(content).toContain('3. Production with a domain');
    expect(content).toMatch(/proxied.*ws.*DNS/i);
    expect(content).toMatch(/Full \(strict\)/i);
    expect(content).toMatch(/Cloudflare Origin Certificate/i);
    expect(content).toMatch(/Caddy example/i);
    expect(content).toMatch(/firewall.*443.*Cloudflare/i);

    // Frontend deploy instructions
    expect(content).toContain('pnpm --filter web build');
    expect(content).toContain('npx wrangler deploy');
    expect(content).toContain('*.workers.dev');
    expect(content).toContain('apps/web/dist');
  });

  it('apps/public-server/.env.example defines every server env var with its default, plus LOBBY_BIND.', () => {
    const envExamplePath = path.join(repoRoot, 'apps/public-server/.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const content = fs.readFileSync(envExamplePath, 'utf8');

    expect(content).toMatch(/^PORT=8080/m);
    expect(content).toMatch(/^HOST=0\.0\.0\.0/m);
    expect(content).toMatch(/^LOBBY_BIND=127\.0\.0\.1/m);
    expect(content).toMatch(/^MAX_PLAYERS=50/m);
    expect(content).toMatch(/^MAX_SPECTATORS=20/m);
    expect(content).toMatch(/^MAX_CONN_PER_IP=3/m);
    expect(content).toMatch(/^ALLOWED_ORIGINS=/m);
    expect(content).toMatch(/^BANNED_IPS=/m);
    expect(content).toMatch(/^TRUST_CF_HEADER=0/m);
  });

  // Acceptance criterion: The CI docker build job passes.
  it('CI workflow defines a docker build job.', () => {
    const ciPath = path.join(repoRoot, '.github/workflows/ci.yml');
    expect(fs.existsSync(ciPath)).toBe(true);
    const content = fs.readFileSync(ciPath, 'utf8');

    expect(content).toContain('docker:');
    expect(content).toContain('docker build -f apps/public-server/Dockerfile .');
  });
});
