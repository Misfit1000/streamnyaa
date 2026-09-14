import DesktopHomeCustomize from './DesktopHomeCustomize';
import {useHomeLayout} from '../lib/desktopHomeLayout';
export default function DesktopHomeSettings(){const preferences=useHomeLayout();return <section aria-label="Home layout"><h3 className="mt-6 text-lg font-semibold">Home layout</h3><DesktopHomeCustomize preferences={preferences}/></section>;}
