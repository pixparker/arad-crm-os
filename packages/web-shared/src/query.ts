import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api.js';

export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          // never retry 4xx — only network/5xx, and only a couple of times
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
    },
  });
