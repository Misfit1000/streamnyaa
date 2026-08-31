import type { ReactNode } from 'react';
import { clampLoadingPercent } from '../lib/desktopLoading';

export default function DesktopLoadingProgress({
  label,
  percent,
  detail,
  variant = 'section',
  children,
  className = '',
}: {
  label: string;
  percent: number;
  detail?: string;
  variant?: 'screen' | 'section' | 'inline';
  children?: ReactNode;
  className?: string;
}) {
  const value = clampLoadingPercent(percent);
  const layout = variant === 'screen'
    ? 'grid min-h-[58vh] place-items-center px-6'
    : variant === 'inline'
      ? ''
      : 'sn-glass-panel p-5';

  return (
    <div className={`${layout} ${className}`.trim()}>
      <div className={variant === 'screen' ? 'w-full max-w-sm bg-[#0d0d10] p-6 ring-1 ring-white/[0.08]' : 'w-full'}>
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm font-semibold text-white/78">{label}</p>
          <output className="shrink-0 text-sm font-semibold tabular-nums text-white" aria-label={`${value} percent loaded`}>{value}%</output>
        </div>
        {detail ? <p className="mt-1 text-xs leading-5 text-white/46">{detail}</p> : null}
        <div
          className="mt-3 h-1 overflow-hidden bg-white/[0.08]"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
        >
          <div className="h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${value}%` }} />
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </div>
  );
}

