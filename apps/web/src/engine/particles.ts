import { Container, Graphics } from 'pixi.js';

export interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  radius: number;
  rotation: number;
  rotSpeed: number;
  lifeMs: number;
  createdAt: number;
  isLeaf: boolean;
}

export class ParticleBurst {
  public container: Container;
  private graphics: Graphics;
  private particles: BurstParticle[] = [];
  private createdAt: number;
  private maxLifeMs = 600;
  private isDestroyed = false;

  constructor(parent: Container, originX: number, originY: number, count = 20) {
    this.createdAt = Date.now();
    this.container = new Container();
    this.container.label = 'teleportBurst';
    this.container.position.set(Math.round(originX), Math.round(originY));

    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
    parent.addChild(this.container);

    const colors = [
      0xffea75, // Golden firefly
      0xfff59d, // Pale firefly glow
      0x7ebd52, // Leaf green
      0x4a7c59, // Forest leaf
      0xa3e048, // Fresh sprout green
    ];

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 40 + Math.random() * 60;
      const isLeaf = i % 2 === 0;
      const lifeMs = 350 + Math.random() * 250;

      this.particles.push({
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[i % colors.length],
        radius: isLeaf ? 3 : 2,
        rotation: Math.random() * Math.PI,
        rotSpeed: (Math.random() - 0.5) * 6,
        lifeMs,
        createdAt: Date.now(),
        isLeaf,
      });
    }
  }

  public update(nowMs = Date.now()): boolean {
    if (this.isDestroyed) return false;

    const elapsed = nowMs - this.createdAt;
    if (elapsed >= this.maxLifeMs) {
      this.destroy();
      return false;
    }

    this.graphics.clear();
    let hasAlive = false;

    for (const p of this.particles) {
      const pElapsed = nowMs - p.createdAt;
      if (pElapsed >= p.lifeMs) continue;
      hasAlive = true;

      const progress = pElapsed / p.lifeMs;
      const alpha = Math.max(0, 1 - progress);
      const dt = pElapsed / 1000;
      const curX = p.vx * dt;
      const curY = p.vy * dt - 12 * dt; // Subtle float upward

      if (p.isLeaf) {
        // Render stylized leaf
        this.graphics
          .ellipse(curX, curY, p.radius * 1.5, p.radius * 0.8)
          .fill({ color: p.color, alpha });
      } else {
        // Render soft glowing firefly particle
        this.graphics
          .circle(curX, curY, p.radius)
          .fill({ color: p.color, alpha });
      }
    }

    if (!hasAlive) {
      this.destroy();
      return false;
    }
    return true;
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
    this.container.destroy({ children: true });
  }
}

const activeBursts = new Set<ParticleBurst>();

export function spawnParticleBurst(
  x: number,
  y: number,
  parentLayer: Container
): ParticleBurst {
  const burst = new ParticleBurst(parentLayer, x, y);
  activeBursts.add(burst);
  return burst;
}

export function updateActiveBursts(nowMs = Date.now()): void {
  for (const burst of Array.from(activeBursts)) {
    const alive = burst.update(nowMs);
    if (!alive) {
      activeBursts.delete(burst);
    }
  }
}

export function clearActiveBursts(): void {
  for (const burst of Array.from(activeBursts)) {
    burst.destroy();
  }
  activeBursts.clear();
}
