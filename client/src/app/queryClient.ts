import { QueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/lib/api';

// Server data cache shared by the whole app.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Hospital data changes often but not every second; live updates come
      // over Socket.io in phase 2 and invalidate the affected queries.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Retry only what can succeed on a second try: lost connection or a
      // server hiccup. A 4xx answer will be the same next time.
      retry: (failureCount, error) => {
        const { status } = describeApiError(error);
        return (status === 0 || status >= 500) && failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});
