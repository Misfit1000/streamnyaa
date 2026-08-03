import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { fetchAnimeDetails } from '../services/anilist';
import { watchRouteParams } from '../lib/mediaNavigation';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Anime'>;

// Backward-compatible deep-link bridge. Anime is no longer a separate web-like
// details page: desktop and mobile both enter the integrated cinema view.
export function AnimeScreen({ route, navigation }: Props) {
  const query = useQuery({
    queryKey: ['anime', route.params.animeId, route.params.anilistId, route.params.malId, route.params.kitsuId],
    queryFn: ({ signal }) => fetchAnimeDetails(route.params.animeId, {
      anilistId: route.params.anilistId,
      malId: route.params.malId,
      kitsuId: route.params.kitsuId,
      title: route.params.title,
    }, signal),
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (query.data) navigation.replace('Watch', watchRouteParams(query.data));
  }, [navigation, query.data]);

  if (query.isError) {
    return <Screen><StateView title="Title unavailable" message={query.error.message} onRetry={() => void query.refetch()} /></Screen>;
  }
  return <Screen><StateView loading message={`Opening ${route.params.title || 'anime'}...`} /></Screen>;
}
