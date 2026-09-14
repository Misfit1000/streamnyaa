import { useEffect, useState } from 'react';
import { chooseDownloadDirectory, getDownloadQueue, openDownloadManager } from '../lib/desktopDownloads';

export default function DesktopDownloadSettings() {
  const [directory, setDirectory] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let disposed = false; void getDownloadQueue().then(queue => { if (!disposed) setDirectory(queue.downloadDirectory); }).catch(issue => { if (!disposed) setError(String(issue)); }); return () => { disposed = true; }; }, []);
  return <section id="downloads" className="sn-glass-panel scroll-mt-24 p-5">
    <h2 className="text-lg font-semibold">Download location</h2>
    <p className="mt-2 break-all text-sm text-white/75">{directory || 'Choose a folder now, or you will be asked on your first download.'}</p>
    <p className="mt-2 text-sm text-white/55">Changing this location applies to new releases. Existing downloads stay in their original folders. Download files are separate from the playback cache.</p>
    <div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} className="sn-primary-action px-4 py-2" onClick={async () => { setBusy(true); setError(''); try { const queue = await chooseDownloadDirectory(); if (queue) setDirectory(queue.downloadDirectory); } catch (issue) { setError(String(issue)); } finally { setBusy(false); } }}>{busy ? 'Choosing folder…' : 'Choose folder'}</button><button className="sn-secondary-action px-4 py-2" onClick={openDownloadManager}>Manage downloads</button></div>
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
  </section>;
}
