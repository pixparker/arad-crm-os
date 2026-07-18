'use client';

// App-wide client providers: the shared query client (ADR-009 web-shared glue)
// + the toast surface used for optimistic/error feedback.

import { ToastProvider } from '@/components/toast';
import { createQueryClient } from '@arad-crm/web-shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
