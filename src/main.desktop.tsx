import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppDesktop from './AppDesktop';
import { updateDesktopBoot } from './lib/desktopBoot';
import './index.css';

window.__STREAMNYAA_DESKTOP__ = true;
updateDesktopBoot({ percent: 38, label: 'Starting the desktop interface' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppDesktop />
  </StrictMode>,
);
