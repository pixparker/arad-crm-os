// apiFetch — the one HTTP path both web apps use (ADR-009 web-shared glue):
// cookie credentials, correlation id, contract-shaped error handling, and
// optional Idempotency-Key passthrough for retry-safe mutations (ADR-008).

import {
  CORRELATION_HEADER,
  IDEMPOTENCY_HEADER,
  errorResponseSchema,
} from '@arad-crm/api-contracts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly meta?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (meta !== undefined) this.meta = meta;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  idempotencyKey?: string;
}

// 🔒 Name must match what the Dockerfiles bake in (deploy/Dockerfile.web-*:
// NEXT_PUBLIC_API_BASE_URL). Next inlines these at BUILD time, so a mismatch
// is invisible in dev — where the localhost fallback is correct — and silently
// points production at localhost. NEXT_PUBLIC_API_URL stays accepted as an
// alias so an existing local .env keeps working.
const baseUrl = (): string =>
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:6100';

export const apiFetch = async <T>(path: string, options: ApiFetchOptions = {}): Promise<T> => {
  const { body, idempotencyKey, headers, ...rest } = options;
  const res = await fetch(`${baseUrl()}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      [CORRELATION_HEADER]: crypto.randomUUID(),
      ...(idempotencyKey ? { [IDEMPOTENCY_HEADER]: idempotencyKey } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
    if (parsed.success) {
      throw new ApiError(res.status, parsed.data.code, parsed.data.message, parsed.data.meta);
    }
    throw new ApiError(res.status, 'internal_error', `request failed: ${res.status}`);
  }
  return (await res.json()) as T;
};
