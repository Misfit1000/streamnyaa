import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const isDesktopShell = import.meta.env.VITE_STREAMNYAA_APP_TARGET === 'desktop'
  || new URLSearchParams(window.location.search).get('desktop') === '1'
  || Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);

createRoot(document.getElementById('root')!).render(
  isDesktopShell ? (
    <App />
  ) : (
    <StrictMode>
      <App />
    </StrictMode>
  ),
);
