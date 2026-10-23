//! Engine file identity is authoritative. Playlist labels never select media.
use super::*;

fn path(value:&str)->String { value.replace('\\', "/") }
fn basename(value:&str)->&str {value.rsplit(['/', '\\']).next().unwrap_or(value)}
fn extra(name:&str,r:&PlaybackRequest)->bool{batch_sources::extra_for(name,r.source_identity.as_ref().map(|i|i.format.as_str()).unwrap_or("TV"))}
fn parent(value:&str)->String {path(value).rsplit_once('/').map(|(p,_)|p.to_string()).unwrap_or_default()}

pub fn manifest(value:&serde_json::Value)->Result<batch_sources::Manifest,String>{
    let value=value.get("details").unwrap_or(value);
    let hash=value.get("info_hash").and_then(|s|s.as_str()).and_then(batch_sources::canonical_hash).ok_or("Local file resolution: torrent identity missing.")?;
    let files=value.get("files").and_then(|s|s.as_array()).ok_or("Local file resolution: manifest not ready.")?;
    if files.is_empty()||files.len()>5000{return Err("Local file resolution: invalid manifest size.".into());}
    let files=files.iter().enumerate().map(|(index,file)|{
        let name=file.get("name").and_then(|s|s.as_str()).map(str::to_string)
            .or_else(||file.get("components").and_then(|v|v.as_array()).and_then(|parts|parts.iter().map(|p|p.as_str()).collect::<Option<Vec<_>>>()).map(|parts|parts.join("/")))
            .ok_or("Local file resolution: invalid filename.")?;
        Ok(batch_sources::File{index,name,bytes:file.get("length").and_then(|v|v.as_u64()).ok_or("Local file resolution: file size missing.")?})
    }).collect::<Result<Vec<_>,String>>()?;
    let m=batch_sources::Manifest{info_hash:hash,version:1,files,retrieved_at:now_millis()};
    if !batch_sources::valid(&m){return Err("Local file resolution: invalid manifest paths.".into());}
    Ok(m)
}

pub fn target(torrent_id:&str,request:&PlaybackRequest,value:&serde_json::Value)->Result<ResolvedStreamTarget,String>{
    let m=manifest(value)?;
    let expected=magnet_info_hash(&request.magnet).or_else(||request.info_hash.clone()).and_then(|s|batch_sources::canonical_hash(&s)).ok_or("Local file resolution: release hash missing.")?;
    if expected!=m.info_hash{return Err("Local file resolution: engine torrent identity mismatch.".into());}
    if request.batch_selection.is_none(){batch_sources::save_cache(&m);}
    let media=if let Some(selection)=&request.batch_selection {
        let cached=batch_sources::read_cache(&expected).ok_or("Local file resolution: selected manifest expired.")?;
        if batch_sources::manifest_id(&cached)!=selection.manifest_id || cached.files.len()!=m.files.len()
            || cached.files.iter().zip(&m.files).any(|(a,b)|a.index!=b.index||path(&a.name)!=path(&b.name)||a.bytes!=b.bytes){return Err("Local file resolution: engine manifest differs from the selected release.".into());}
        m.files.get(selection.file_index).filter(|f|batch_sources::video(f)&&!extra(&f.name,request)).ok_or("Local file resolution: selected file missing.")?
    }else{
        let identity=request.source_identity.as_ref();
        if let Some(identity)=identity {if source_identity::classify(&request.title,identity,request.episode.parse().unwrap_or(1))!=source_identity::Evidence::Exact{return Err("Source identity: requested installment or episode is unverified.".into());}}
        let videos:Vec<_>=m.files.iter().filter(|f|batch_sources::video(f)&&!extra(&f.name,request)).collect();
        let ep=request.episode.parse::<u64>().ok();
        let matching:Vec<_>=videos.iter().copied().filter(|f|{
            let actual=source_identity::release_episode(basename(&f.name));
            if actual.zip(ep).is_some_and(|(a,b)|a!=b){return false;}
            if identity.is_some_and(|i|source_identity::season_marker(&f.name).zip(i.season_number).is_some_and(|(a,b)|a!=b)||source_identity::part_marker(&f.name).zip(i.part_number).is_some_and(|(a,b)|a!=b)){return false;}
            if videos.len()==1{return actual.is_some() || identity.is_none() || identity.is_some_and(|i|i.format=="MOVIE");}
            ep.is_some_and(|ep|source_identity::matches_episode(&f.name,ep))
        }).collect();
        if matching.len()!=1{return Err("Episode file selection: choose the requested video; no unique matching file exists.".into());}
        matching[0]
    };
    let media_name=basename(&media.name);
    let stem=stem_from_name(media_name);
    let subtitles:Vec<_>=m.files.iter().filter(|f|parent(&f.name)==parent(&media.name)&&is_subtitle_extension(&extension_from_name(basename(&f.name)))
        && (stem_from_name(basename(&f.name)).eq_ignore_ascii_case(&stem)||stem_from_name(basename(&f.name)).to_lowercase().starts_with(&format!("{}.",stem.to_lowercase())))).collect();
    let url=|index:usize|format!("{}/torrents/{}/stream/{}",rqbit_url(),percent_encode(torrent_id),index);
    let mut indices=vec![media.index];indices.extend(subtitles.iter().map(|s|s.index));
    Ok(ResolvedStreamTarget{media_url:url(media.index),subtitle_urls:subtitles.iter().map(|f|url(f.index)).collect(),selected_file_indices:indices,selected_file_name:media.name.clone()})
}

#[cfg(test)]
mod tests {
 use super::*;
 fn request()->PlaybackRequest {serde_json::from_value(serde_json::json!({"magnet":format!("magnet:?xt=urn:btih:{}","d".repeat(40)),"info_hash":"d".repeat(40),"title":"Example Anime S02E02 [1080p]","anime_title":"Example Anime Season 2","episode":"2","source_identity":{"animeId":"mal:2","aliases":["Example Anime Season 2"],"installmentAliases":["Example Anime Season 2"],"format":"TV","seasonNumber":2,"partNumber":null,"sequel":true}})).unwrap()}
 fn details(files:Vec<(&str,u64)>)->serde_json::Value{serde_json::json!({"info_hash":"d".repeat(40),"files":files.into_iter().map(|(name,length)|serde_json::json!({"name":name,"length":length})).collect::<Vec<_>>()})}
 #[test] fn index_and_full_path_survive_unicode_percent_and_duplicate_basenames(){
  let mut r=request();let mut d=details(vec![("Folder + [100%]/Example Anime S02E02 [雪, +%25].mkv",100),("Other/Example Anime S02E02 [雪, +%25].mkv",110),("Folder + [100%]/Example Anime S02E02 [雪, +%25].eng.srt",10)]);
  d["info_hash"]=serde_json::json!("e".repeat(40));r.magnet=format!("magnet:?xt=urn:btih:{}","e".repeat(40));r.info_hash=Some("e".repeat(40));
  let m=manifest(&d).unwrap();batch_sources::save_cache(&m);r.batch_selection=Some(batch_sources::Selection{info_hash:m.info_hash.clone(),manifest_id:batch_sources::manifest_id(&m),file_index:0,manual:true,episode:Some(2)});
  let t=target("731",&r,&d).unwrap();assert_eq!(t.selected_file_indices,vec![0,2]);assert_eq!(t.media_url,format!("{}/torrents/731/stream/0",rqbit_url()));
  let mut changed=d.clone();changed["files"][0]["length"]=serde_json::json!(101);assert!(target("731",&r,&changed).is_err());
  let mut hash=d;hash["info_hash"]=serde_json::json!("b".repeat(40));assert!(target("731",&r,&hash).is_err());
 }
 #[test] fn individual_releases_never_choose_a_wrong_or_ambiguous_file(){
  let r=request();assert!(target("1",&r,&details(vec![("Example Anime S01E02.mkv",100)])).is_err());
  assert!(target("1",&r,&details(vec![("Example Anime S02E01.mkv",100)])).is_err());
  assert!(target("1",&r,&details(vec![("Example Anime S02E02 [1080p].mkv",100),("Example Anime S02E02 [720p].mkv",100)])).is_err());
  assert!(target("1",&r,&details(vec![("Example Anime S02E02.mkv",100),("extras/sample.mkv",10)])).is_ok());
 }
 #[test] fn ova_installments_are_not_mistaken_for_extras(){
  let mut r=request();r.title="Example Anime OVA - 02 [1080p]".into();let identity=r.source_identity.as_mut().unwrap();identity.format="OVA".into();identity.aliases=vec!["Example Anime OVA".into()];identity.season_number=None;identity.sequel=false;
  assert!(target("1",&r,&details(vec![("OVA/Example Anime OVA - 02.mkv",100)])).is_ok());
 }
}
