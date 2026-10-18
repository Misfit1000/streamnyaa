import { useState } from 'react';
import { desktopInterfaceScales, saveInterfaceScale, useInterfaceScale } from '../lib/desktopAppearance';

export default function DesktopAppearanceSettings() {
  const scale = useInterfaceScale();
  const [error, setError] = useState('');
  return <section className="sn-glass-panel p-5" aria-labelledby="interface-size-heading">
    <h2 className="text-lg font-semibold">Appearance</h2>
    <h3 id="interface-size-heading" className="mt-4 text-base font-semibold">Interface size</h3>
    <p className="mt-1 text-sm text-white/60">Adjust app text and controls without changing the video or subtitles. This preference stays on this PC.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      {desktopInterfaceScales.map((value) => <button type="button" key={value} aria-pressed={scale === value}
        className={scale === value ? 'sn-primary-action' : 'sn-secondary-action'}
        onClick={() => { try { saveInterfaceScale(value); setError(''); } catch { setError('Could not save interface size. Check available storage.'); } }}>
        {value}%{value === 100 ? ' (default)' : ''}
      </button>)}
    </div>
    {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
  </section>;
}
