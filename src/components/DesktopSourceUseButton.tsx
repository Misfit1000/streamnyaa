import { Check } from 'lucide-react';

export default function DesktopSourceUseButton({ selected, unavailableReason, title, onSelect, busy=false }: {
  selected: boolean; unavailableReason?: string; title: string; onSelect: () => void; busy?:boolean;
}) {
  return <button type="button" className="sn-secondary-action sn-source-use" disabled={busy||Boolean(unavailableReason)} aria-busy={busy}
    aria-pressed={selected} aria-label={`${selected ? 'Selected' : 'Use'} source: ${title}`}
    title={unavailableReason || (selected ? 'Play this selected release' : 'Play this release; choose its episode file if needed')}
    onClick={onSelect}>{busy?'Checking…':selected ? <><Check size={14} aria-hidden="true" />Selected</> : 'Use'}</button>;
}
