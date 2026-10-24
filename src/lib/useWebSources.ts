import {useSourceContinuation} from './useSourceContinuation';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {discoverWebSources,webSourceKey,type WebSource,type WebSourceRequest} from './webSources';
import type {SourceDiscovery} from './desktopSourceDiscovery';
export function useWebSources(request:WebSourceRequest,enabled=true){
  enabled=enabled&&(request.provider!=='sukebei'||request.adultAllowed===true);
  const client=useQueryClient(),key=webSourceKey(request);
  const query=useQuery({queryKey:key,enabled:enabled&&Boolean(request.identity?.animeId||request.query?.trim().length&&request.query.trim().length>=2),retry:false,refetchOnWindowFocus:false,staleTime:request.episode?60000:300000,
    queryFn:({signal})=>discoverWebSources(request,{signal,previous:client.getQueryData<SourceDiscovery<WebSource>>(key),publish:value=>client.setQueryData(key,value)})});
  useSourceContinuation(JSON.stringify(key),{enabled,fetching:query.isFetching,eligible:Boolean(query.data?.items.some(item=>!request.identity||item.matchTier==='exact'||item.matchTier==='batch')),pending:Boolean(query.data?.pending?.length),stale:query.data?.stale,providerFailure:query.data?.partialReason==='provider-failure',retryAt:query.data?.retryAt,run:query.refetch});
  return query;
}
