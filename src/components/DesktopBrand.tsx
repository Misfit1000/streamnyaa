import { useState } from 'react';
import desktopLogo from '../assets/desktop-logo.png';
import '../styles/desktop-brand.css';
export default function DesktopBrand({ collapsed = false, compact = false }: { collapsed?: boolean; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className={`sn-desktop-brand ${compact ? 'is-compact' : ''}`}>
    {failed ? <span className="sn-brand-fallback">S</span> : <img src={desktopLogo} alt="" loading="eager" decoding="async" onError={() => setFailed(true)} />}
    {!collapsed && <span className="sn-brand-copy"><span className="sn-brand-name">Stream<span>Nyaa</span></span>{!compact && <small>Desktop Cinema</small>}</span>}
    {collapsed && <span className="sr-only">StreamNyaa</span>}
  </span>;
}
