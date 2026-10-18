import { useEffect, useState } from 'react';
export default function DesktopEpisodeThumbnail({ artwork, title }: { artwork: { candidates: string[]; specific: boolean; specificCount: number; label: string }; title: string }) {
  const [index, setIndex] = useState(0);
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  const signature = artwork.candidates.join('|');
  useEffect(() => { setIndex(0); setFit('cover'); }, [signature]);
  const source = artwork.candidates[index];
  const label = artwork.specific && index < artwork.specificCount ? artwork.label : artwork.label.includes('spoilers hidden') ? artwork.label : 'Series artwork';
  return <span className="relative block h-full w-full overflow-hidden bg-[#17171b]" title={label}>
    {source && <span aria-hidden="true" className="absolute inset-0 scale-110 bg-cover bg-center opacity-35 blur-lg" style={{ backgroundImage: `url(${JSON.stringify(source)})` }} />}
    {source ? <img src={source} alt={title} loading="lazy" decoding="async" referrerPolicy="no-referrer"
      className={`relative h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
      onLoad={event => {
        const image = event.currentTarget;
        const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
        // A panoramic masthead is not a full-frame still. Prefer a real poster
        // when supplied; otherwise crop the panorama rather than showing a strip.
        if (ratio > 2.6 && index + 1 < artwork.candidates.length) { setIndex(value => value + 1); return; }
        setFit(ratio < 1.25 ? 'contain' : 'cover');
      }}
      onError={() => setIndex(value => value + 1)} /> : <span className="flex h-full items-end bg-gradient-to-br from-[#26151d] to-[#111115] p-4 text-sm text-white/65">{title}</span>}
    <span className="sr-only">{label}</span>
  </span>;
}
