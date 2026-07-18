// Shared wire shapes (ADR-008). 🔒 Single source of truth: enums/shapes used
// by any API surface are declared HERE — the contracts-enums CI guard rejects
// re-declarations elsewhere.

import { z } from 'zod';

export const CORRELATION_HEADER = 'x-correlation-id';
export const IDEMPOTENCY_HEADER = 'idempotency-key';

export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  meta: z.record(z.unknown()).optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// Cursor pagination — never offset (ADR-008).
export const cursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const cursorPageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    next_cursor: z.string().nullable(),
  });
