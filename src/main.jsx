import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { StoreProvider } from './lib/store.jsx';
import { applyTheme } from './lib/theme.js';
import { applyEffects } from './lib/effects.js';
import './styles/index.css';

applyTheme();
applyEffects();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>
);
