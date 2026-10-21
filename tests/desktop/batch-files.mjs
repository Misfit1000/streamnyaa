import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
const root=path.resolve('.validation/batch-engine-fixture');await fs.mkdir(root,{recursive:true});
const mediaPath=path.resolve('.validation/completion-fixture.mkv');
try{await fs.access(mediaPath);}catch{await new Promise((resolve,reject)=>{const media=spawn(path.resolve('desktop/src-tauri/bin/mpv.com'),['--no-config','--ao=null','--ovc=ffv1','--of=matroska',`--o=${mediaPath}`,'av://lavfi:testsrc=duration=3:size=64x64:rate=12','--term-status-msg='],{windowsHide:true,stdio:'ignore'});media.once('error',reject);media.once('exit',code=>code===0?resolve():reject(Error('Could not generate valid fixture media.')));});}
const fixture=await fs.readFile(mediaPath);
const encode=value=>Buffer.isBuffer(value)?Buffer.concat([Buffer.from(`${value.length}:`),value]):typeof value==='string'?encode(Buffer.from(value)):typeof value==='number'?Buffer.from(`i${value}e`):Array.isArray(value)?Buffer.concat([Buffer.from('l'),...value.map(encode),Buffer.from('e')]):Buffer.concat([Buffer.from('d'),...Object.keys(value).sort().flatMap(key=>[encode(key),encode(value[key])]),Buffer.from('e')]);
const files=Array.from({length:10},(_,index)=>({length:fixture.length,path:[`Fixture Anime S01E${String(index+1).padStart(2,'0')}.mkv`]}));
const data=Buffer.concat(files.map(()=>fixture)),pieces=[];for(let offset=0;offset<data.length;offset+=16384)pieces.push(createHash('sha1').update(data.subarray(offset,offset+16384)).digest());
const info={files,name:'Fixture Anime','piece length':16384,pieces:Buffer.concat(pieces),private:1};
// A small compliant BEP-9 metadata peer keeps this test independent of the
// bundled 8.1.1 seeder's own metadata-extension interoperability limitation.
function decode(buffer,at=0){const tag=String.fromCharCode(buffer[at]);if(tag==='i'){const end=buffer.indexOf(101,at);return[Number(buffer.subarray(at+1,end)),end+1];}if(tag==='d'||tag==='l'){const result=tag==='d'?{}:[];at++;while(buffer[at]!==101){const [value,end]=decode(buffer,at);at=end;if(tag==='l')result.push(value);else{const [child,next]=decode(buffer,at);result[value.toString()]=child;at=next;}}return[result,at+1];}const colon=buffer.indexOf(58,at),length=Number(buffer.subarray(at,colon));return[buffer.subarray(colon+1,colon+1+length),colon+1+length];}
const infoBytes=encode(info),infoHash=createHash('sha1').update(infoBytes).digest(),sockets=new Set();
const metadataPeer=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});let pending=Buffer.alloc(0),handshake=false,clientMetadataId=1;
  const message=(prefix,body)=>{const bytes=Buffer.concat([Buffer.from(prefix),body]),length=Buffer.alloc(4);length.writeUInt32BE(bytes.length);socket.write(Buffer.concat([length,bytes]));};
  socket.on('data',chunk=>{pending=Buffer.concat([pending,chunk]);if(pending.length>65536)return socket.destroy();
    if(!handshake){if(pending.length<68)return;if(!pending.subarray(28,48).equals(infoHash))return socket.destroy();pending=pending.subarray(68);handshake=true;const reserved=Buffer.alloc(8);reserved[5]=16;socket.write(Buffer.concat([Buffer.from([19]),Buffer.from('BitTorrent protocol'),reserved,infoHash,Buffer.from('-SN0001-123456789012')]));message([20,0],encode({m:{ut_metadata:1},metadata_size:infoBytes.length}));}
    while(pending.length>=4){const length=pending.readUInt32BE(0);if(length>65536)return socket.destroy();if(pending.length<length+4)return;const body=pending.subarray(4,4+length);pending=pending.subarray(length+4);if(body.length<2||body[0]!==20)continue;try{const [value]=decode(body,2);if(body[1]===0){clientMetadataId=Number(value.m?.ut_metadata)||1;}else if(body[1]===1&&value.msg_type===0){const piece=Number(value.piece);if(piece>=0&&piece*16384<infoBytes.length)message([20,clientMetadataId],Buffer.concat([encode({msg_type:1,piece,total_size:infoBytes.length}),infoBytes.subarray(piece*16384,(piece+1)*16384)]));}}catch{socket.destroy();}}
  });});
await new Promise(resolve=>metadataPeer.listen(0,'127.0.0.1',resolve));const metadataPort=metadataPeer.address().port;
const peerPort=await unusedPort();
const tracker=http.createServer((_request,response)=>{response.writeHead(200,{'Content-Type':'text/plain'});response.end(encode({interval:60,peers:Buffer.from([127,0,0,1,metadataPort>>8,metadataPort&255])}));});
await new Promise(resolve=>tracker.listen(0,'127.0.0.1',resolve));const trackerUrl=`http://127.0.0.1:${tracker.address().port}/announce`;
const hash=createHash('sha1').update(encode(info)).digest('hex'),torrent=path.join(root,'fixture.torrent');await fs.writeFile(torrent,encode({announce:trackerUrl,info}));
const seed=path.join(root,'seed');await fs.mkdir(path.join(seed,'Fixture Anime'),{recursive:true});for(const file of files)await fs.writeFile(path.join(seed,...file.path),fixture);
const fixtureRecord={hash,torrent,files:10,bytes:fixture.length,root};await fs.writeFile(path.resolve('.validation/batch-fixture.json'),JSON.stringify(fixtureRecord,null,2));
async function unusedPort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});}
const port=await unusedPort();
const base=`http://127.0.0.1:${port}`,engine=spawn(path.resolve('desktop/src-tauri/bin/rqbit.exe'),['-v','debug','--disable-dht','--disable-upnp-port-forward','--disable-dht-persistence','--tcp-min-port',String(peerPort),'--tcp-max-port',String(peerPort+1),'--http-api-listen-addr',`127.0.0.1:${port}`,'server','start','--disable-persistence',seed],{windowsHide:true,env:{...process.env,NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost'},stdio:['ignore','pipe','pipe']});
let leecher;
let stderr='';engine.stderr.on('data',chunk=>stderr=(stderr+chunk).slice(-16384));engine.stdout.on('data',chunk=>stderr=(stderr+chunk).slice(-16384));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(route,body,origin=base){const response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:body&&typeof body==='object'&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{},body:body===undefined?undefined:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});const text=await response.text();assert.ok(response.ok,`${response.status}: ${text}`);return JSON.parse(text);}
try{
  for(let attempt=0;attempt<50;attempt++){try{await api('/');break;}catch{if(engine.exitCode!==null)throw Error(stderr);if(attempt===49)throw Error('Fixture engine did not start.');await pause(100);}}
  const torrentBytes=await fs.readFile(torrent);
  const inspection=await api('/torrents?list_only=true',torrentBytes);assert.equal(inspection.details.info_hash,hash);assert.equal(inspection.details.files.length,10);
  assert.equal((await api('/torrents')).torrents.length,0,'Inspection must not add an active download');
  const seeding=await api(`/torrents?overwrite=true&output_folder=${encodeURIComponent(seed)}`,torrentBytes);assert.ok(seeding.id!==undefined);
  let stats;for(let attempt=0;attempt<80;attempt++){stats=await api(`/torrents/${seeding.id}/stats/v1`);if(stats.state==='live'&&stats.finished)break;await pause(100);}assert.equal(stats.finished,true,JSON.stringify({stats,seeding}));
  const clientPort=await unusedPort(),clientBase=`http://127.0.0.1:${clientPort}`,clientRoot=path.join(root,`client-${Date.now()}`);await fs.mkdir(clientRoot,{recursive:true});
  leecher=spawn(path.resolve('desktop/src-tauri/bin/rqbit.exe'),['-v','debug','--disable-dht','--disable-tcp-listen','--disable-upnp-port-forward','--disable-dht-persistence','--http-api-listen-addr',`127.0.0.1:${clientPort}`,'server','start','--disable-persistence',clientRoot],{windowsHide:true,env:{...process.env,NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost'},stdio:['ignore','pipe','pipe']});leecher.stderr.on('data',chunk=>stderr=(stderr+chunk).slice(-16384));leecher.stdout.on('data',chunk=>stderr=(stderr+chunk).slice(-16384));
  for(let attempt=0;attempt<50;attempt++){try{await api('/',undefined,clientBase);break;}catch{if(leecher.exitCode!==null)throw Error(stderr);if(attempt===49)throw Error('Fixture client did not start.');await pause(100);}}
  console.log('Seeder ready', {peerPort, hash});
  const peers=encodeURIComponent(`127.0.0.1:${peerPort}`),magnet=`magnet:?xt=urn:btih:${hash}&tr=${encodeURIComponent(trackerUrl)}`;
  console.log('Resolving fixture magnet');
  const resolved=await api(`/torrents?list_only=true&initial_peers=${encodeURIComponent(`127.0.0.1:${metadataPort}`)}`,magnet,clientBase);assert.equal(resolved.details.files.length,10);assert.equal((await api('/torrents',undefined,clientBase)).torrents.length,0);
  console.log('Metadata resolved, adding selected file');
  const added=await api(`/torrents?overwrite=true&only_files=1&initial_peers=${peers}`,torrentBytes,clientBase),id=added.id;assert.ok(id!==undefined);
  for(let attempt=0;attempt<80;attempt++){stats=await api(`/torrents/${id}/stats/v1`,undefined,clientBase);if(stats.state==='live')break;await pause(100);}assert.equal(stats.state,'live');
  const playlist=await (await fetch(`${clientBase}/torrents/${id}/playlist`)).text();assert.ok(playlist.includes('/stream/'));
  console.log('Client ready, streaming selected files');
  for(const index of [1,2]){
    await api(`/torrents/${id}/update_only_files`,{only_files:[index]},clientBase);
    const response=await fetch(`${clientBase}/torrents/${id}/stream/${index}`,{signal:AbortSignal.timeout(10000)});assert.ok(response.ok);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(fixture).digest('hex'));
    const current=await api(`/torrents/${id}`,undefined,clientBase);assert.equal(current.info_hash||current.details?.info_hash,hash);
    assert.deepEqual(current.files.filter(file=>file.included).map((_,position)=>current.files.indexOf(current.files.filter(file=>file.included)[position])),[index]);
    if(index===1&&process.argv.includes('--native')){
      const command=spawn('cargo',['test','--manifest-path','desktop/src-tauri/Cargo.toml','batch_metadata_native_acceptance','--','--ignored','--nocapture'],{windowsHide:true,env:{...process.env,STREAMNYAA_BATCH_FIXTURE_MAGNET:magnet,STREAMNYAA_BATCH_FIXTURE_PEER:`127.0.0.1:${metadataPort}`,NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost'},stdio:['ignore','pipe','pipe']});let log='';command.stdout.on('data',chunk=>{log+=chunk;process.stdout.write(chunk);});command.stderr.on('data',chunk=>{log+=chunk;process.stdout.write(chunk);});
      const code=await new Promise((resolve,reject)=>{command.on('error',reject);command.on('exit',resolve);});await fs.writeFile(path.resolve('.validation/batch-native-fixture.log'),log);assert.equal(code,0);assert.equal(leecher.exitCode,null,'Inspection must leave active transfer engine running');
    }
  }
  const evidence={...fixtureRecord,passed:true,metadataOnlyDidNotAddDownload:true,selectedIndices:[1,2],sameTorrentId:id,enginePid:engine.pid,externalProvidersContacted:false,elapsedNote:'Local fixture only; not a public-provider benchmark.'};
  await fs.writeFile(path.resolve('.validation/batch-engine-results.json'),JSON.stringify(evidence,null,2));console.log(evidence);
}catch(error){await fs.writeFile(path.resolve('.validation/batch-engine-error.log'),stderr);console.error(stderr.slice(-8000));throw error;}finally{for(const socket of sockets)socket.destroy();metadataPeer.close();tracker.closeAllConnections();tracker.close();leecher?.kill();engine.kill();await Promise.race([new Promise(resolve=>engine.once('exit',resolve)),pause(2000)]);}
