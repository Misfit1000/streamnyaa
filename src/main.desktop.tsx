import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppDesktop from './AppDesktop';
import './index.css';

window.__STREAMNYAA_DESKTOP__ = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppDesktop />
  </StrictMode>,
);

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    const boot = document.getElementById('streamnyaa-desktop-boot');
    if (!boot) return;
    boot.classList.add('sn-boot--leaving');
    window.setTimeout(() => boot.remove(), 220);
  });
});
