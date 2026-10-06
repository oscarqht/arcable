import React from 'react';
import ReactDOM from 'react-dom/client';
import '../utils/themeInit';
import { App } from './App';
import { initSidepanelShortcuts } from './shortcuts';

initSidepanelShortcuts();

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
