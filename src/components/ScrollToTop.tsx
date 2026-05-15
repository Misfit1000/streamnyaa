import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (hash && /^#[A-Za-z][\w-]*$/.test(hash)) {
      try {
        const target = document.querySelector(hash);
        if (target) {
          target.scrollIntoView({ block: 'start' });
          return;
        }
      } catch {
        // OAuth redirects can place token data in the URL hash; those are not page anchors.
      }
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, search, hash]);

  return null;
}
