-- Compatible replacement: remove only aliases represented by a verified incoming episode/track.
create or replace function public.merge_calendar_snapshot(p_key text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare combined jsonb;
begin
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1500 or octet_length(p_rows::text)>2097152 then raise exception 'Invalid Calendar snapshot'; end if;
  insert into site_public_snapshots values(p_key,'[]',now(),now()+interval '60 days') on conflict do nothing;
  perform 1 from site_public_snapshots where key=p_key for update;
  with incoming as (select value as row from jsonb_array_elements(p_rows)),
  candidates as (
    select value as row from site_public_snapshots s cross join lateral jsonb_array_elements(s.payload) where s.key=p_key
    union all select row from incoming
  ), retained as (
    select candidate.row from candidates candidate where not exists (
      select 1 from incoming linked where linked.row->>'scheduleId'<>candidate.row->>'scheduleId'
        and linked.row->>'airingEpisode'=candidate.row->>'airingEpisode' and linked.row->>'releaseTrack'=candidate.row->>'releaseTrack'
        and coalesce(linked.row->>'anilist_id',linked.row->>'mal_id') is not null
        and (nullif(linked.row->>'sourceRoute','')=candidate.row->>'sourceRoute'
          or nullif(linked.row->>'mal_id','')=candidate.row->>'mal_id')
        and (candidate.row->>'anilist_id' is null or candidate.row->>'anilist_id'=linked.row->>'anilist_id')
        and (candidate.row->>'mal_id' is null or linked.row->>'mal_id' is null or candidate.row->>'mal_id'=linked.row->>'mal_id')
    )
  ), selected as (
    select distinct on (row->>'scheduleId') row from retained where row->>'scheduleId' is not null
      order by row->>'scheduleId',(row->>'scheduleProvider'='animeschedule') desc,(row->>'scheduleFetchedAt')::bigint desc
  )
  select coalesce(jsonb_agg(row),'[]') into combined from (
    select row from selected order by (row->>'scheduleFetchedAt')::bigint desc limit 1500
  ) bounded;
  update site_public_snapshots set payload=combined,fetched_at=now(),expires_at=now()+interval '60 days' where key=p_key;
  return combined;
end $$;
revoke all on function public.merge_calendar_snapshot(text,jsonb) from public,anon,authenticated;
grant execute on function public.merge_calendar_snapshot(text,jsonb) to service_role;
