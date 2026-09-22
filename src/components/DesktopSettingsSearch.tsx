import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
const sections = [
  { id:'downloads', title:'Downloads & location', words:'folder directory save download manager' },
  { id:'appearance', title:'Appearance & interface size', words:'classic revamped revert theme text scale' },
  { id:'playback', title:'Playback preferences', words:'audio subtitles autoplay spoiler player' },
  { id:'controls', title:'Keyboard shortcuts', words:'keys bindings controls' },
  { id:'updates', title:'Notifications & reminders', words:'calendar delay cancelled alerts' },
  { id:'storage', title:'Storage & cache', words:'disk temporary space clear downloads' },
  { id:'privacy', title:'Backup, restore & privacy', words:'export import history settings library' },
  { id:'advanced', title:'Advanced app paths', words:'player streaming engine temporary folder' },
  { id:'diagnostics', title:'Diagnostics & tools', words:'error episode metadata connection anilist jikan mpv repair' },
];
export default function DesktopSettingsSearch() {
  const { isAdmin } = useAuth();
  const [query,setQuery] = useState('');
  const matches = sections.filter(item => (item.id !== 'diagnostics' || isAdmin) && `${item.title} ${item.words}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <div className="my-5"><input aria-label="Find a setting" placeholder="Find a setting…" value={query} onChange={e => setQuery(e.target.value)} className="sn-input w-full px-4 py-3" />
    <nav className="sn-settings-results mt-2 flex flex-wrap text-sm text-white/65" aria-label="Settings search results">{matches.map(item => <a key={item.id} href={`#${item.id}`} onClick={() => { const section = document.getElementById(item.id); section?.scrollIntoView({ block:'start' }); section?.setAttribute('tabindex','-1'); section?.focus({preventScroll:true}); }}>{item.title}</a>)}{!matches.length && <p className="p-3">No matching setting. Try “playback”, “backup” or “downloads”.</p>}</nav>
  </div>;
}
