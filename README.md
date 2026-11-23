# lofi-forest

Cozy 2D multiplayer hangout & Pomodoro game.

## Local Development

### Prerequisites
- Node 22 (`.nvmrc` provided)
- pnpm 9+

### Setup
Install dependencies:
```bash
pnpm i
```

### Running Locally
Run the web client (Vite):
```bash
pnpm --filter web dev
```

Run the public server (`PORT=8080`):
```bash
pnpm --filter public-server dev
```

### Building and Testing
```bash
pnpm typecheck
pnpm test
pnpm build
```

## Deploy

### Frontend Deploy

#### Cloudflare Workers (Static Assets)
Build the web client and deploy using Wrangler from `apps/web`:
```bash
pnpm --filter web build
cd apps/web && npx wrangler deploy
```
This serves the application on `*.workers.dev`.

#### Cloudflare Pages
To deploy via Cloudflare Pages in the Cloudflare dashboard:
- **Build command:** `pnpm --filter web build`
- **Build output directory:** `apps/web/dist`

---

### Lobby Server Deploy

The lobby server runs inside Docker using Docker Compose (`apps/public-server/docker-compose.yml`).

Before starting the server, create your `.env` configuration file from the template:
```bash
cp apps/public-server/.env.example apps/public-server/.env
```

#### 1. Test on the server IP

Test the lobby server directly on the VPS bare public IP without needing a custom domain or TLS certificate.

1. Configure environment variables in `apps/public-server/.env`:
   ```ini
   LOBBY_BIND=0.0.0.0
   TRUST_CF_HEADER=0
   ```
   > [!WARNING]
   > **Direct IP exposure warning:** Keep `TRUST_CF_HEADER=0` when directly exposing the server on `0.0.0.0`. If `TRUST_CF_HEADER=1` is enabled on direct exposure, clients can forge the `CF-Connecting-IP` header and bypass rate limits and IP bans. Only set `TRUST_CF_HEADER=1` when traffic is exclusively routed through Cloudflare.

2. Open port 8080 in the firewall:
   ```bash
   sudo ufw allow 8080/tcp
   ```

3. Build and run the lobby container:
   ```bash
   cd apps/public-server && docker compose up -d --build
   ```

4. Verify server health:
   ```bash
   curl http://<ip>:8080/health
   ```

5. Run the web app locally pointing to the remote server IP:
   ```bash
   VITE_PUBLIC_WS_URL=ws://<ip>:8080/ws pnpm --filter web dev
   ```

> [!NOTE]
> Because modern web browsers forbid mixed-content connections, an HTTPS page cannot open an insecure `ws://` connection. Therefore, a site deployed on Cloudflare (over HTTPS) cannot connect to `ws://<ip>:8080/ws`. Direct IP testing requires running the web app locally (over `http://localhost:5173`), or connecting through a Cloudflare quick tunnel or domain as described below.

#### 2. Test from the deployed site via a quick tunnel

To test a deployed HTTPS web app against the lobby server without configuring a domain or SSL certificate, use a free Cloudflare Quick Tunnel.

1. Keep `LOBBY_BIND=127.0.0.1` and set `TRUST_CF_HEADER=1` in `apps/public-server/.env`.
2. Start the lobby container:
   ```bash
   cd apps/public-server && docker compose up -d --build
   ```
3. Run `cloudflared` to launch a quick tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```
   This generates an ephemeral public URL such as `https://<random>.trycloudflare.com`.
4. Point your deployed web app to the tunnel WebSocket endpoint:
   ```bash
   VITE_PUBLIC_WS_URL=wss://<random>.trycloudflare.com/ws
   ```
   and ensure `TRUST_CF_HEADER=1` is set on the lobby server.
5. Note: The URL changes on every restart of `cloudflared`.

#### 3. Production with a domain

For production deployments behind the Cloudflare Proxy:

1. In the Cloudflare DNS dashboard, create a proxied `ws` DNS record (orange cloud icon, e.g. `ws.example.com`) pointing to your VPS IP.
2. In the Cloudflare dashboard under **SSL/TLS**, set encryption mode to **Full (strict)**.
3. Generate a **Cloudflare Origin Certificate** and install the certificate and private key on your VPS (e.g. at `/etc/ssl/certs/cloudflare-origin.crt` and `/etc/ssl/private/cloudflare-origin.key`).
4. Set up a reverse proxy using the Caddy example ([`deploy/Caddyfile.example`](deploy/Caddyfile.example)) or Nginx example ([`deploy/nginx.conf.example`](deploy/nginx.conf.example)), proxying to `127.0.0.1:8080`.
5. In `apps/public-server/.env`, keep `LOBBY_BIND=127.0.0.1` and set `TRUST_CF_HEADER=1`.
6. Configure your firewall to restrict port 443 to Cloudflare IP ranges only (see https://www.cloudflare.com/ips/), blocking direct access from the public internet.
