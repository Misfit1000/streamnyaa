import { QueryClient } from '@tanstack/react-query';
import { shouldRetryRequest } from './network';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: shouldRetryRequest,
      retryDelay: (attempt) => Math.min(1_600, 350 * (2 ** attempt)),
      networkMode: 'offlineFirst',
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});
