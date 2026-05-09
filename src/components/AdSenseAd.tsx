import { useEffect } from 'react';

type AdSenseAdProps = {
  className?: string;
  slot?: string;
};

const ADSENSE_CLIENT_ID = 'ca-pub-3878702638437768';

export default function AdSenseAd({ className = '', slot }: AdSenseAdProps) {
  const adSlot = slot || import.meta.env.VITE_ADSENSE_DISPLAY_SLOT || '';

  useEffect(() => {
    if (!adSlot) return;
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // Ad blockers or early script timing can throw here; the page should keep working.
    }
  }, [adSlot]);

  if (!adSlot) return null;

  return (
    <aside className={`my-8 ${className}`} aria-label="Advertisement">
      <div className="mb-2 text-center text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">
        Advertisement
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-secondary/20 p-2">
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={ADSENSE_CLIENT_ID}
          data-ad-slot={adSlot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </aside>
  );
}
