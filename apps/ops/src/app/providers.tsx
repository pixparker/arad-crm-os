'use client';

// App-wide providers. Two of these are the kit's and must be mounted once near
// the root or the primitives that depend on them throw at call time:
//   · ConfirmProvider — `useConfirm()` for the irreversible actions.
//   · Toaster — where `undoableToast` and every other toast lands.
// RouteProgressProvider gives the "a page is opening" bar for the gap before a
// route's own skeleton renders, which on a control plane over a slow link is
// the difference between "loading" and "did my click register".

import { createQueryClient } from '@arad-crm/web-shared';
import { ConfirmProvider, RouteProgressProvider, Toaster } from '@arad/ops-kit';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <RouteProgressProvider>
        <ConfirmProvider>
          {children}
          <Toaster />
        </ConfirmProvider>
      </RouteProgressProvider>
    </QueryClientProvider>
  );
}
