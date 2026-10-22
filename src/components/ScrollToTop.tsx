import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const positions = new Map<string, number>();

export default function ScrollToTop() {
  const { pathname, search, hash, key } = useLocation();
  const navigation = useNavigationType();

  useEffect(() => {
    const top = navigation === 'POP' ? positions.get(key) || 0 : 0;
    const save = () => { positions.set(key, window.scrollY); while (positions.size > 100) positions.delete(positions.keys().next().value!); };
    let observer: MutationObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (hash && /^#[A-Za-z][\w-]*$/.test(hash)) {
      try {
        const target = document.querySelector(hash);
        if (target) {
          target.scrollIntoView({ block: 'start' });
          window.addEventListener('scroll', save, { passive: true });
          return () => window.removeEventListener('scroll', save);
        }
      } catch {
        // OAuth redirects can place token data in the URL hash; those are not page anchors.
      }
    }

    window.scrollTo({ top, left: 0, behavior: 'auto' });
    const stop = () => { observer?.disconnect(); if (timer) clearTimeout(timer); };
    if (top > document.documentElement.scrollHeight - window.innerHeight && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => { window.scrollTo({ top, behavior: 'auto' }); if (document.documentElement.scrollHeight >= top + window.innerHeight) stop(); });
      observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
      timer = setTimeout(stop, 5000);
    }
    window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('pointerdown', stop);
    return () => { stop(); window.removeEventListener('scroll', save); window.removeEventListener('wheel', stop); window.removeEventListener('pointerdown', stop); };
  }, [pathname, search, hash, key, navigation]);

  return null;
}
