import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { createWorldLayers, updateEntityZIndexes } from './layers';
import { renderTiledMap, parseTiledMap } from './tiled';
import { generateStarterMap } from './starterMapData';

describe('World Layers & Tiled Rendering', () => {
  it('creates layers in exact order: groundLayer, groundDecorLayer, entityLayer, canopyLayer, atmosphereLayer, worldUiLayer', () => {
    const stage = new Container();
    const layers = createWorldLayers(stage);

    expect(stage.children[0]).toBe(layers.groundLayer);
    expect(stage.children[1]).toBe(layers.groundDecorLayer);
    expect(stage.children[2]).toBe(layers.entityLayer);
    expect(stage.children[3]).toBe(layers.canopyLayer);
    expect(stage.children[4]).toBe(layers.atmosphereLayer);
    expect(stage.children[5]).toBe(layers.worldUiLayer);

    expect(layers.entityLayer.sortableChildren).toBe(true);
  });

  it('updates entityLayer zIndex = Math.round(footY)', () => {
    const layer = new Container();
    layer.sortableChildren = true;

    const entity1 = new Container();
    (entity1 as any).footY = 42.7;
    const entity2 = new Container();
    (entity2 as any).footY = 15.2;

    layer.addChild(entity1);
    layer.addChild(entity2);

    updateEntityZIndexes(layer);

    expect(entity1.zIndex).toBe(43);
    expect(entity2.zIndex).toBe(15);
  });

  it('swaps water frames every 500 ms based on wall-clock time', () => {
    const stage = new Container();
    const layers = createWorldLayers(stage);
    const rawMap = generateStarterMap();
    const parsed = parseTiledMap(rawMap);

    const renderer = renderTiledMap(parsed, layers);
    expect(renderer.waterSprites.length).toBeGreaterThan(0);

    // Frame 0 at t = 0..499 ms
    renderer.update(200);
    expect(renderer.currentWaterFrame).toBe(0);

    // Frame 1 at t = 500..999 ms
    renderer.update(600);
    expect(renderer.currentWaterFrame).toBe(1);

    // Frame 0 at t = 1000..1499 ms
    renderer.update(1100);
    expect(renderer.currentWaterFrame).toBe(0);
  });
});
