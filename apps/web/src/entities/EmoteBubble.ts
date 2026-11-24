import { Container, Graphics, Sprite } from 'pixi.js';
import { EMOTE_HOLD_MS, type EmoteId } from '@lofi/shared';
import { assetLoader } from '../engine/assets/AssetLoader';

export type ClockFn = () => number;

export interface ShowEmoteOptions {
  worldUiLayer?: Container;
  clock?: ClockFn;
}

const activeEmoteBubbles = new Map<Container, EmoteBubble>();

/**
 * Overshoot pop-in tween scale curve:
 * 0 -> 1.2 -> 1 over ~200 ms.
 */
export function getEmoteScale(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs < 140) {
    // Smooth rise from 0 to 1.2 overshoot peak
    return 1.2 * Math.sin((elapsedMs / 140) * (Math.PI / 2));
  }
  if (elapsedMs < 200) {
    // Settle from 1.2 down to 1.0
    return 1.2 - 0.2 * ((elapsedMs - 140) / 60);
  }
  return 1.0;
}

export class EmoteBubble extends Container {
  public readonly emoteId: EmoteId;
  public readonly avatar: Container;
  public readonly targetLayer: Container;
  public readonly clock: ClockFn;
  public readonly startTime: number;
  public isRemoved = false;

  public readonly bg: Graphics;
  public readonly icon: Sprite;

  private intervalId: any = null;

  constructor(
    avatar: Container,
    emoteId: EmoteId,
    targetLayer: Container,
    clock: ClockFn = () => Date.now()
  ) {
    super();
    this.label = 'emoteBubble';
    this.avatar = avatar;
    this.emoteId = emoteId;
    this.targetLayer = targetLayer;
    this.clock = clock;
    this.startTime = this.clock();

    // Pivot at center of the 16x16 bubble
    this.pivot.set(0, 0);

    // 1. Bubble Background: 16x16 box with tail
    this.bg = new Graphics();
    this.bg.label = 'emoteBubbleBg';

    // Rounded rectangle centered around (0, -1) so bounding box fits 16x16
    this.bg.roundRect(-8, -8, 16, 14, 3);
    this.bg.fill({ color: 0xfffaeb });
    this.bg.stroke({ color: 0x211509, width: 1 });

    // Downward pointer tail
    this.bg.poly([
      { x: -2, y: 5 },
      { x: 2, y: 5 },
      { x: 0, y: 8 },
    ]);
    this.bg.fill({ color: 0xfffaeb });
    this.bg.stroke({ color: 0x211509, width: 1 });

    this.addChild(this.bg);

    // 2. Emote Icon Sprite
    const texture = assetLoader.getEmoteTextureSync(emoteId);
    this.icon = new Sprite(texture);
    this.icon.label = 'emoteBubbleIcon';
    this.icon.anchor.set(0.5, 0.5);
    this.icon.position.set(0, -1);
    this.icon.width = 12;
    this.icon.height = 12;
    this.addChild(this.icon);

    // Add to targetLayer
    this.targetLayer.addChild(this);

    // Set initial transform
    this.update(this.startTime);

    // Interval to ensure timer updates in background tabs and fake-timer tests
    this.intervalId = setInterval(() => {
      this.update(this.clock());
    }, 16);
  }

  public update(now: number = this.clock()): void {
    if (this.isRemoved) return;

    if (!this.avatar || (this.avatar as any).destroyed) {
      this.destroy();
      return;
    }

    const elapsed = now - this.startTime;

    // After 4000 ms: removed!
    if (elapsed >= 4000) {
      this.destroy();
      return;
    }

    // Follow avatar head position
    const headX = (this.avatar as any).headAnchor?.x ?? 0;
    const headY = (this.avatar as any).headAnchor?.y ?? 0;
    this.position.set(
      Math.round(this.avatar.x + headX),
      Math.round(this.avatar.y - 28 + headY)
    );

    // 1. Pop-in overshoot tween: 0 -> 1.2 -> 1 over 200 ms
    const scale = getEmoteScale(elapsed);
    this.scale.set(scale, scale);

    // 2. Fade out: holds for EMOTE_HOLD_MS (3500 ms), then fades out over 300 ms (3700 ms to 4000 ms)
    let alpha = 1;
    if (elapsed > 200 + EMOTE_HOLD_MS) {
      const fadeElapsed = elapsed - (200 + EMOTE_HOLD_MS);
      alpha = Math.max(0, 1 - fadeElapsed / 300);
    }
    this.alpha = alpha;
    this.visible = alpha > 0;
  }

  public override destroy(options?: Parameters<Container['destroy']>[0]): void {
    if (this.isRemoved) return;
    this.isRemoved = true;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.parent) {
      this.parent.removeChild(this);
    }

    if (activeEmoteBubbles.get(this.avatar) === this) {
      activeEmoteBubbles.delete(this.avatar);
    }

    super.destroy(options ?? { children: true });
  }
}

export function resolveWorldUiLayer(
  avatar: Container,
  explicitLayer?: Container
): Container {
  if (explicitLayer) return explicitLayer;
  if ((avatar as any).worldUiLayer) return (avatar as any).worldUiLayer;
  if ((avatar as any).layers?.worldUiLayer) return (avatar as any).layers.worldUiLayer;
  if (avatar.parent) {
    if (avatar.parent.label === 'worldUiLayer') return avatar.parent;
    if (avatar.parent.parent) {
      const found = avatar.parent.parent.children?.find(
        (c) => c.label === 'worldUiLayer'
      );
      if (found) return found;
    }
    const sibling = avatar.parent.children?.find(
      (c) => c.label === 'worldUiLayer'
    );
    if (sibling) return sibling;
  }
  const ge = (globalThis as any).__lofiGameEngine;
  if (ge?.layers?.worldUiLayer) {
    return ge.layers.worldUiLayer;
  }
  return avatar.parent || avatar;
}

export function showEmote(
  avatar: Container,
  emoteId: EmoteId,
  worldUiLayerOrOptionsOrClock?: Container | ShowEmoteOptions | ClockFn,
  clockArg?: ClockFn
): EmoteBubble {
  let explicitLayer: Container | undefined;
  let clock: ClockFn = () => Date.now();

  if (typeof worldUiLayerOrOptionsOrClock === 'function') {
    clock = worldUiLayerOrOptionsOrClock;
  } else if (
    worldUiLayerOrOptionsOrClock &&
    'clock' in worldUiLayerOrOptionsOrClock &&
    typeof (worldUiLayerOrOptionsOrClock as ShowEmoteOptions).clock === 'function'
  ) {
    const opts = worldUiLayerOrOptionsOrClock as ShowEmoteOptions;
    if (opts.clock) clock = opts.clock;
    if (opts.worldUiLayer) explicitLayer = opts.worldUiLayer;
  } else if (worldUiLayerOrOptionsOrClock instanceof Container) {
    explicitLayer = worldUiLayerOrOptionsOrClock;
    if (typeof clockArg === 'function') {
      clock = clockArg;
    }
  } else if (typeof clockArg === 'function') {
    clock = clockArg;
  }

  // A new emote replaces the current one
  const existing = activeEmoteBubbles.get(avatar);
  if (existing) {
    existing.destroy();
  }

  const targetLayer = resolveWorldUiLayer(avatar, explicitLayer);
  const bubble = new EmoteBubble(avatar, emoteId, targetLayer, clock);
  activeEmoteBubbles.set(avatar, bubble);
  return bubble;
}

export function updateEmoteBubbles(now: number = Date.now()): void {
  for (const bubble of Array.from(activeEmoteBubbles.values())) {
    bubble.update(now);
  }
}

export function destroyEmoteBubble(avatar: Container): void {
  const existing = activeEmoteBubbles.get(avatar);
  if (existing) {
    existing.destroy();
  }
}

export function getActiveEmoteBubble(avatar: Container): EmoteBubble | undefined {
  return activeEmoteBubbles.get(avatar);
}

export function clearAllEmoteBubbles(): void {
  for (const bubble of Array.from(activeEmoteBubbles.values())) {
    bubble.destroy();
  }
  activeEmoteBubbles.clear();
}
