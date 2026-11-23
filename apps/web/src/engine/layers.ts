import { Container } from 'pixi.js';

export interface WorldLayers {
  groundLayer: Container;
  groundDecorLayer: Container;
  entityLayer: Container;
  canopyLayer: Container;
  atmosphereLayer: Container;
  worldUiLayer: Container;
}

export function createWorldLayers(worldContainer: Container): WorldLayers {
  const groundLayer = new Container();
  groundLayer.label = 'groundLayer';

  const groundDecorLayer = new Container();
  groundDecorLayer.label = 'groundDecorLayer';

  const entityLayer = new Container();
  entityLayer.label = 'entityLayer';
  entityLayer.sortableChildren = true;

  const canopyLayer = new Container();
  canopyLayer.label = 'canopyLayer';

  const atmosphereLayer = new Container();
  atmosphereLayer.label = 'atmosphereLayer';

  const worldUiLayer = new Container();
  worldUiLayer.label = 'worldUiLayer';

  // Order: groundLayer, groundDecorLayer, entityLayer, canopyLayer, atmosphereLayer, worldUiLayer
  worldContainer.addChild(groundLayer);
  worldContainer.addChild(groundDecorLayer);
  worldContainer.addChild(entityLayer);
  worldContainer.addChild(canopyLayer);
  worldContainer.addChild(atmosphereLayer);
  worldContainer.addChild(worldUiLayer);

  return {
    groundLayer,
    groundDecorLayer,
    entityLayer,
    canopyLayer,
    atmosphereLayer,
    worldUiLayer,
  };
}

export function updateEntityZIndexes(entityLayer: Container): void {
  for (const child of entityLayer.children) {
    const footY = (child as any).footY;
    if (typeof footY === 'number') {
      child.zIndex = Math.round(footY);
    }
  }
  entityLayer.sortChildren();
}
