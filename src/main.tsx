import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@app-entry';
import './index.css';

async function mount() {
  // Keep the server-rendered article visible until its client module is ready.
  if (import.meta.env.VITE_STREAMNYAA_APP_TARGET !== 'desktop' && document.getElementById('streamnyaa-article')) await import('./pages/BlogPost');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void mount();
