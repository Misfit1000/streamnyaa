import { Check } from 'lucide-react';

export default function DesktopSourceUseButton({ selected, unavailableReason, title, onSelect }: {
  selected: boolean; unavailableReason?: string; title: string; onSelect: () => void;
}) {
  return <button type="button" className="sn-secondary-action sn-source-use" disabled={Boolean(unavailableReason)}
    aria-pressed={selected} aria-label={`${selected ? 'Selected' : 'Use'} source: ${title}`}
    title={unavailableReason || (selected ? 'Selected for the main Play button' : 'Select this release for the main Play button')}
    onClick={onSelect}>{selected ? <><Check size={14} aria-hidden="true" />Selected</> : 'Use'}</button>;
}
