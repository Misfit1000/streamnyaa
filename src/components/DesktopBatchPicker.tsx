import DesktopDrawer from './DesktopDrawer';
import type { BatchFile } from '../lib/desktopBatchSources';
export default function DesktopBatchPicker({open,episode,files,onChoose,onClose,reason,releaseTitle}:{open:boolean;episode:number;files:BatchFile[];reason?:string;releaseTitle?:string;onChoose:(file:BatchFile)=>void;onClose:()=>void}){
  return <DesktopDrawer open={open} title="Choose episode file" subtitle={`Select the video for Episode ${episode}. Only this file and its matching subtitles will be requested.`} onClose={onClose}>
    {releaseTitle&&<p className="mb-2 break-words text-sm text-white/70">{releaseTitle}</p>}
    {reason&&<p className="mb-4 text-sm text-white/65">{reason}</p>}
    <div className="grid gap-2">{files.map(file=><button key={file.index} type="button" className="sn-secondary-action min-h-12 text-left" style={{whiteSpace:'normal',overflowWrap:'anywhere',justifyContent:'flex-start'}} onClick={()=>onChoose(file)}>{file.name}<small className="ml-auto shrink-0 text-white/50">{Math.round(file.bytes/1024/1024)} MiB</small></button>)}</div>
  </DesktopDrawer>;
}
