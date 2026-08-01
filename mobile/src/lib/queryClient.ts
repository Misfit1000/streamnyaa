import { QueryClient } from '@tanstack/react-query';
import { shouldRetryRequest } from './network';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      retry: shouldRetryRequest,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
  },
});
