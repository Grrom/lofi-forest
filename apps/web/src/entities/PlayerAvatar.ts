import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { Facing, Outfit, PlayerAction } from '@lofi/shared';
import { assetLoader } from '../engine/assets/AssetLoader';
import { StorageManager } from '../systems/StorageManager';
import { ProceduralAnimator, type AnimationSample } from './ProceduralAnimator';

export interface PlayerAvatarOptions {
  outfit?: Outfit;
  facing?: Facing;
  action?: PlayerAction;
  name?: string | null;
  showNames?: boolean;
  status?: 'none' | 'focus' | 'break';
}

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  alpha: number;
  life: number;
  maxLife: number;
}

/**
 * PlayerAvatar renders a layered, procedurally animated character avatar.
 *
 * Layers (in container order):
 * 1. ellipse drop shadow (Graphics)
 * 2. base sprite (`char_base`, mirrored by facing)
 * 3. hat layer at head anchor (Sprite)
 * 4. clothing layer with `outfit.colorHex` tint (Sprite)
 * + nameplate text (pixel font, toggled by showNames)
 * + floating status icon (book for focus, coffee for break)
 * + particles (drifting Zzz during sleep, sparkle/heart burst on celebrate)
 */
export class PlayerAvatar extends Container {
  public outfit: Outfit;
  public facing: Facing;
  public action: PlayerAction;
  public playerName: string | null = null;
  public showNames: boolean;
  public status: 'none' | 'focus' | 'break';

  public headAnchor = { x: 0, y: 0 };

  // Layers
  public readonly shadow: Graphics;
  public readonly baseSprite: Sprite;
  public readonly hatLayer: Sprite;
  public readonly hatSprite: Sprite;
  public readonly clothingLayer: Sprite;
  public readonly clothingSprite: Sprite;
  public readonly nameplate: Text;
  public readonly statusContainer: Container;
  public readonly statusSprite: Sprite;
  public readonly particlesContainer: Container;

  private previousAction: PlayerAction = 'idle';
  private celebrateStartTime = 0;
  private lastZzzSpawnTime = 0;
  private particles: Particle[] = [];
  private unsubStorage?: () => void;

  constructor(options?: PlayerAvatarOptions) {
    super();
    this.label = 'playerAvatar';

    this.outfit = options?.outfit
      ? { ...options.outfit }
      : { ...StorageManager.get().profile.outfit };
    this.facing = options?.facing ?? 'down';
    this.action = options?.action ?? 'idle';
    this.playerName = options?.name !== undefined ? options.name : StorageManager.get().profile.name;
    this.showNames = options?.showNames !== undefined ? options.showNames : StorageManager.get().showNames;
    this.status = options?.status ?? 'none';

    // 1. Ellipse drop shadow
    this.shadow = new Graphics();
    this.shadow.label = 'shadow';
    this.shadow.ellipse(0, 0, 6, 2.5);
    this.shadow.fill({ color: 0x000000, alpha: 0.25 });
    this.addChild(this.shadow);

    // 2. Base sprite (char_base, mirrored by facing)
    const baseTexture = assetLoader.getTextureSync(this.outfit.baseId || 'char_base');
    this.baseSprite = new Sprite(baseTexture);
    this.baseSprite.label = 'baseSprite';
    this.baseSprite.anchor.set(0.5, 1.0);
    this.addChild(this.baseSprite);

    // 3. Hat layer at head anchor
    const hatTexture = assetLoader.getHatTextureSync(this.outfit.hatId || 'none');
    this.hatLayer = new Sprite(hatTexture);
    this.hatLayer.label = 'hatLayer';
    this.hatLayer.anchor.set(0.5, 1.0);
    this.hatLayer.position.set(this.headAnchor.x, this.headAnchor.y);
    this.hatLayer.visible = this.outfit.hatId !== 'none';
    this.hatSprite = this.hatLayer;
    this.addChild(this.hatLayer);

    // 4. Clothing layer (tinted with outfit.colorHex)
    const clothingTexture = assetLoader.getTextureSync('char_clothing');
    this.clothingLayer = new Sprite(clothingTexture);
    this.clothingLayer.label = 'clothingLayer';
    this.clothingLayer.anchor.set(0.5, 1.0);
    if (this.outfit.colorHex) {
      this.clothingLayer.tint = this.outfit.colorHex;
    }
    this.clothingSprite = this.clothingLayer;
    this.addChild(this.clothingLayer);

    // Nameplate Text
    this.nameplate = new Text({
      text: this.playerName ?? '',
      style: {
        fontFamily: 'monospace',
        fontSize: 10,
        fill: 0xfffaeb,
        stroke: { color: 0x211509, width: 2 },
        align: 'center',
      },
    });
    this.nameplate.label = 'nameplate';
    this.nameplate.anchor.set(0.5, 1.0);
    this.nameplate.position.set(0, -18);
    this.nameplate.visible = Boolean(this.playerName && this.showNames);
    this.addChild(this.nameplate);

    // Status icon container & sprite
    this.statusContainer = new Container();
    this.statusContainer.label = 'statusContainer';
    this.statusContainer.position.set(0, -30);
    this.statusContainer.visible = this.status !== 'none';

    this.statusSprite = new Sprite(
      this.status === 'focus'
        ? assetLoader.getTextureSync('book')
        : this.status === 'break'
          ? assetLoader.getTextureSync('coffee')
          : assetLoader.getTextureSync('book')
    );
    this.statusSprite.label = 'statusSprite';
    this.statusSprite.anchor.set(0.5, 0.5);
    this.statusSprite.visible = this.status !== 'none';
    this.statusContainer.addChild(this.statusSprite);
    this.addChild(this.statusContainer);

    // Particles container
    this.particlesContainer = new Container();
    this.particlesContainer.label = 'particlesContainer';
    this.addChild(this.particlesContainer);

    // Subscribe to StorageManager to automatically sync showNames pref
    this.unsubStorage = StorageManager.subscribe((prefs) => {
      if (this.showNames !== prefs.showNames) {
        this.setShowNames(prefs.showNames);
      }
    });

    this.setFacing(this.facing);
    this.setAction(this.action);
  }

  public setOutfit(outfit: Outfit): void {
    this.outfit = { ...outfit };

    // Update hat layer
    if (outfit.hatId && outfit.hatId !== 'none') {
      this.hatLayer.texture = assetLoader.getHatTextureSync(outfit.hatId);
      this.hatLayer.visible = true;
    } else {
      this.hatLayer.texture = assetLoader.getHatTextureSync('none');
      this.hatLayer.visible = false;
    }

    // Update clothing layer tint
    if (outfit.colorHex) {
      this.clothingLayer.tint = outfit.colorHex;
    }

    // Update base sprite if baseId provided
    if (outfit.baseId) {
      this.baseSprite.texture = assetLoader.getTextureSync(outfit.baseId);
    }
  }

  public setAction(action: PlayerAction): void {
    if (this.action === action) return;
    this.action = action;

    if (action !== 'sleep') {
      this.clearZzzParticles();
    }
  }

  public setFacing(facing: Facing): void {
    this.facing = facing;
    const facingSign = facing === 'left' ? -1 : 1;
    this.baseSprite.scale.x = facingSign * Math.abs(this.baseSprite.scale.x || 1);
    this.clothingLayer.scale.x = facingSign * Math.abs(this.clothingLayer.scale.x || 1);
    this.hatLayer.scale.x = facingSign * Math.abs(this.hatLayer.scale.x || 1);
  }

  public setName(name: string | null): void {
    this.playerName = name;
    this.nameplate.text = name ?? '';
    this.nameplate.visible = Boolean(name && this.showNames);
  }

  public getName(): string | null {
    return this.playerName;
  }

  public setShowNames(show: boolean): void {
    this.showNames = show;
    this.nameplate.visible = Boolean(this.playerName && this.showNames);
  }

  public setStatus(status: 'none' | 'focus' | 'break'): void {
    this.status = status;
    if (status === 'none') {
      this.statusContainer.visible = false;
      this.statusSprite.visible = false;
    } else if (status === 'focus') {
      this.statusSprite.texture = assetLoader.getTextureSync('book');
      this.statusContainer.visible = true;
      this.statusSprite.visible = true;
    } else if (status === 'break') {
      this.statusSprite.texture = assetLoader.getTextureSync('coffee');
      this.statusContainer.visible = true;
      this.statusSprite.visible = true;
    }
  }

  public celebrate(): void {
    if (this.action !== 'celebrate') {
      this.previousAction = this.action;
    }
    this.setAction('celebrate');
    this.celebrateStartTime = Date.now();
    this.spawnCelebrateBurst();
  }

  private spawnCelebrateBurst(): void {
    for (let i = 0; i < 6; i++) {
      const isSparkle = i % 2 === 0;
      const tex = isSparkle
        ? assetLoader.getEmoteTextureSync('sparkle')
        : assetLoader.getEmoteTextureSync('heart');
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5, 0.5);
      sprite.scale.set(0.6 + Math.random() * 0.4);
      sprite.position.set((Math.random() - 0.5) * 8, -14);
      this.particlesContainer.addChild(sprite);
      this.particles.push({
        sprite,
        vx: (Math.random() - 0.5) * 40,
        vy: -25 - Math.random() * 30,
        alpha: 1,
        life: 0,
        maxLife: 1.2 + Math.random() * 0.6,
      });
    }
  }

  private clearZzzParticles(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      if (this.particles[i].sprite.label === 'zzzParticle') {
        this.particles[i].sprite.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  public update(dt: number, now: number = Date.now()): void {
    // 1. Celebrate timer check: revert to previousAction after 3000 ms
    if (this.action === 'celebrate') {
      const elapsed = now - this.celebrateStartTime;
      if (elapsed >= 3000) {
        this.setAction(this.previousAction || 'idle');
      }
    }

    // 2. Procedural animation sampling
    const tMs = this.action === 'celebrate' ? now - this.celebrateStartTime : now;
    const anim: AnimationSample = ProceduralAnimator.sample(this.action, tMs);

    const facingSign = this.facing === 'left' ? -1 : 1;
    const sx = facingSign * anim.scaleX;
    const sy = anim.scaleY;
    const oy = anim.offsetY;
    const rot = anim.rotation;

    // Apply procedural transforms to visible layers
    this.baseSprite.position.set(0, oy);
    this.baseSprite.scale.set(sx, sy);
    this.baseSprite.rotation = rot;

    this.clothingLayer.position.set(0, oy);
    this.clothingLayer.scale.set(sx, sy);
    this.clothingLayer.rotation = rot;

    this.hatLayer.position.set(this.headAnchor.x, this.headAnchor.y + oy);
    this.hatLayer.scale.set(sx, sy);
    this.hatLayer.rotation = rot;

    // Nameplate offset with animation
    this.nameplate.position.set(0, -18 + oy);

    // Floating status icon bobbing
    if (this.status !== 'none') {
      const bob = Math.sin((now / 500) * Math.PI) * 2;
      this.statusContainer.position.set(0, -30 + oy + bob);
    }

    // Sleep Zzz particles emission
    if (this.action === 'sleep') {
      if (now - this.lastZzzSpawnTime >= 900) {
        this.lastZzzSpawnTime = now;
        const tex = assetLoader.getEmoteTextureSync('zzz');
        const sprite = new Sprite(tex);
        sprite.label = 'zzzParticle';
        sprite.anchor.set(0.5, 0.5);
        sprite.scale.set(0.6);
        sprite.position.set(2, -14);
        this.particlesContainer.addChild(sprite);
        this.particles.push({
          sprite,
          vx: 5 + (Math.random() - 0.5) * 4,
          vy: -12,
          alpha: 0.9,
          life: 0,
          maxLife: 1.8,
        });
      }
    }

    // Update active particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.alpha = Math.max(0, p.alpha * (1 - p.life / p.maxLife));
    }
  }

  public override destroy(options?: Parameters<Container['destroy']>[0]): void {
    if (this.unsubStorage) {
      this.unsubStorage();
      this.unsubStorage = undefined;
    }
    super.destroy(options ?? { children: true });
  }
}
