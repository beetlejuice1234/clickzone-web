import { QueryClient } from '@tanstack/react-query';

// Shared singleton so non-component helpers (e.g. reloadData in api.ts) can
// invalidate queries without needing the React hook.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Match the legacy SWR behaviour: no aggressive refetching that stole input focus.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5000,
    },
  },
});
