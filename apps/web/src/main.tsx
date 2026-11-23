import React from 'react';
import ReactDOM from 'react-dom/client';
import { Application } from 'pixi.js';
import App from './App';

export async function initApp() {
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
