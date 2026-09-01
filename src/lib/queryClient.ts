import { QueryClient } from '@tanstack/react-query';

export function createAppQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
        staleTime: 1000 * 60 * 12,
        gcTime: 1000 * 60 * 45,
      },
    },
  });

  queryClient.setQueryDefaults(['seasonalAnime'], { staleTime: 1000 * 60 * 20, gcTime: 1000 * 60 * 60 });
  queryClient.setQueryDefaults(['recentEpisodes'], { staleTime: 1000 * 60 * 8, gcTime: 1000 * 60 * 30 });
  queryClient.setQueryDefaults(['upcomingAnime'], { staleTime: 1000 * 60 * 30, gcTime: 1000 * 60 * 90 });
  queryClient.setQueryDefaults(['todaySchedule'], { staleTime: 1000 * 60 * 3, gcTime: 1000 * 60 * 15 });
  queryClient.setQueryDefaults(['schedule'], { staleTime: 1000 * 60 * 3, gcTime: 1000 * 60 * 15 });
  queryClient.setQueryDefaults(['genres'], { staleTime: 1000 * 60 * 60 * 6, gcTime: 1000 * 60 * 60 * 12 });
  queryClient.setQueryDefaults(['anime'], { staleTime: 1000 * 60 * 30, gcTime: 1000 * 60 * 90 });
  queryClient.setQueryDefaults(['episodes'], { staleTime: 1000 * 60 * 30, gcTime: 1000 * 60 * 90 });
  queryClient.setQueryDefaults(['manga'], { staleTime: 1000 * 60 * 30, gcTime: 1000 * 60 * 90 });
  queryClient.setQueryDefaults(['anime-download-episodes'], { staleTime: 1000 * 60 * 30, gcTime: 1000 * 60 * 90 });
  queryClient.setQueryDefaults(['download-search-episodes'], { staleTime: 1000 * 60 * 30, gcTime: 1000 * 60 * 90 });
  queryClient.setQueryDefaults(['nyaa'], { staleTime: 1000 * 60 * 2, gcTime: 1000 * 60 * 8 });
  queryClient.setQueryDefaults(['nyaaSearch'], { staleTime: 1000 * 60 * 2, gcTime: 1000 * 60 * 8 });
  queryClient.setQueryDefaults(['nyaa-download'], { staleTime: 1000 * 60 * 2, gcTime: 1000 * 60 * 8 });
  queryClient.setQueryDefaults(['desktop-watch-sources'], { staleTime: 1000 * 60 * 3, gcTime: 1000 * 60 * 12 });
  queryClient.setQueryDefaults(['desktop-seasonal'], { staleTime: 1000 * 60 * 20, gcTime: 1000 * 60 * 60 });
  queryClient.setQueryDefaults(['desktop-recent-episodes'], { staleTime: 1000 * 60 * 8, gcTime: 1000 * 60 * 30 });
  queryClient.setQueryDefaults(['desktop-popular'], { staleTime: 1000 * 60 * 30, gcTime: 1000 * 60 * 90 });
  queryClient.setQueryDefaults(['search'], { staleTime: 1000 * 60 * 10, gcTime: 1000 * 60 * 45 });
  queryClient.setQueryDefaults(['anime-landing'], { staleTime: 1000 * 60 * 20, gcTime: 1000 * 60 * 60 });
  queryClient.setQueryDefaults(['compare-search'], { staleTime: 1000 * 60 * 10, gcTime: 1000 * 60 * 30 });
  queryClient.setQueryDefaults(['downloadSearchAnimeMatch'], { staleTime: 1000 * 60 * 20, gcTime: 1000 * 60 * 60 });
  queryClient.setQueryDefaults(['login-seasonal-visuals'], { staleTime: 1000 * 60 * 60, gcTime: 1000 * 60 * 60 * 6 });
  queryClient.setQueryDefaults(['blog'], { staleTime: 1000 * 60 * 20, gcTime: 1000 * 60 * 60 });

  return queryClient;
}
