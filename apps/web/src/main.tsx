import React from 'react';
import ReactDOM from 'react-dom/client';
import HomePage from './app/page';
import './app/globals.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <HomePage />
    </React.StrictMode>
  );
}
