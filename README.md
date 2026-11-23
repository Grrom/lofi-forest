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
