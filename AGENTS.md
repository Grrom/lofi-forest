# Repository Guidelines & Architecture

## Repository Layout
This repository is a pnpm monorepo organized into apps and shared packages:
- `packages/shared` (`@lofi/shared`): Pure shared domain types, constants, protocol messages, and validators. No runtime UI or networking dependencies.
- `apps/web`: Vite + React + TypeScript + PixiJS v8 web client. Includes Trystero WebRTC peer-to-peer transport, Web Audio sound system, and Cloudflare static deployment configuration.
- `apps/public-server`: Node 22 + `ws` server providing the `/health` endpoint and persistent WebSocket lobby server.

## Common Commands
From repository root:
- `pnpm install`: Install dependencies across all packages.
- `pnpm typecheck`: Run TypeScript typechecks across all workspaces.
- `pnpm test`: Run Vitest unit tests across all workspaces.
- `pnpm build`: Build all packages and applications.

Workspace-specific commands:
- `pnpm --filter web dev`: Start Vite development server for the web app.
- `pnpm --filter public-server dev`: Start public server in development mode with `tsx`.

## Core Rules for Contributors & Agents

1. **Wall-clock `Date.now()` timing only**:
   Always compute time and durations using wall-clock `Date.now()`. Do not rely on frame counts or accumulator math that drifts when framerate drops or tabs are backgrounded.

2. **Network and timer work on `setInterval`, never the Pixi ticker**:
   `requestAnimationFrame` (and therefore the Pixi ticker) pauses when browser tabs are hidden or inactive. Heartbeats, network packet flushes, and time checks must run on `setInterval` or `setTimeout` to ensure tab resilience.

3. **Game logic in pure modules without Pixi imports**:
   Keep simulation logic, collision detection, pathfinding, Pomodoro state machines, interpolation, zone mixing, rate limiting, and protocol validators in pure modules free of Pixi imports so that they are fully unit-testable in Node/Vitest environments.

4. **Asset paths only via `manifest.json`**:
   Every visual asset, sprite, tileset, and audio track path must be resolved through `public/assets/manifest.json`. Never hardcode asset paths in source code. Fall back gracefully to procedural pixels or silence if an asset is missing.

5. **No AI-generated art or music**:
   Only human-created or procedural placeholder pixel art and audio are allowed in this repository. No AI-generated art, music, or speech files may ever be committed.

6. **No free-text chat**:
   Communication is strictly limited to pre-defined emotes, status badges, and non-text interactions. There is no free-text messaging anywhere in the client or server.

7. **Every behavior change needs a Vitest test**:
   Any new behavior, bug fix, or logic change must be accompanied by a Vitest unit or component test covering the acceptance criteria.
