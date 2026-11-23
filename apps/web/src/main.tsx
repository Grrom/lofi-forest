import { setupPixi } from './engine/pixiSetup';
// pixiSetup sets TextureStyle.defaultOptions.scaleMode = 'nearest' before textures or loader run
setupPixi();

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Application, TextureStyle } from 'pixi.js';
import App from './App';
import { assetLoader } from './engine/assets/AssetLoader';

export async function initApp() {
  // Ensure scaleMode is nearest first
  setupPixi();

  // Load asset manifest
  await assetLoader.loadManifest().catch((err) => {
    console.warn('Initial manifest load failed, using fallbacks:', err);
  });

  const app = new Application();
  await app.init({
    resizeTo: window,
    backgroundColor: 0x0b3d0b,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  document.body.prepend(app.canvas);

  const rootElement = document.getElementById('root');
  if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }

  return app;
}

initApp().catch(console.error);
