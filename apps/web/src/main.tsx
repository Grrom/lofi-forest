import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { gameEngine } from './engine/game';

export async function initApp() {
  const app = await gameEngine.init();

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
