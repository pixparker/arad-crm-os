// Correlation id — accepted from the client (web-shared apiFetch generates
// one) or minted here; echoed on the response and carried into logs/audit/
// worker jobs end-to-end (ADR-011).

import { CORRELATION_HEADER } from '@arad-crm/api-contracts';
import type { MiddlewareHandler } from 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    correlationId: string;
  }
}

export const correlationId = (): MiddlewareHandler => async (c, next) => {
  const incoming = c.req.header(CORRELATION_HEADER);
  const id = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  c.set('correlationId', id);
  c.header(CORRELATION_HEADER, id);
  await next();
};
