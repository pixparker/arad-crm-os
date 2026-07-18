// App composition (ADR-003/008): OpenAPIHono under /v1, module routes mounted
// here, AradError mapped centrally, OpenAPI + Scalar docs outside production.
// Module slices live in src/modules/<module>/ — see src/modules/README.md.

import { config } from '@arad-crm/config';
import { AradError, toHttpError } from '@arad/errors';
import { logger } from '@arad/logger';
import { OpenAPIHono } from '@hono/zod-openapi';
import { apiReference } from '@scalar/hono-api-reference';
import { correlationId } from './middleware/correlation-id.js';
import { healthRoutes } from './modules/health/index.js';

export const createApp = () => {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            code: 'validation_error',
            message: 'invalid request',
            meta: { issues: result.error.issues },
          },
          400,
        );
      }
      return undefined;
    },
  });

  app.use('*', correlationId());

  app.onError((err, c) => {
    const cid = c.get('correlationId');
    if (err instanceof AradError) {
      const http = toHttpError(err);
      logger.warn({ err: { code: http.code, message: err.message }, cid }, 'request error');
      return c.json({ code: http.code, message: http.message, meta: err.meta }, http.status as 400);
    }
    logger.error({ err, cid }, 'unhandled error');
    return c.json({ code: 'internal_error', message: 'internal error' }, 500);
  });

  app.notFound((c) => c.json({ code: 'not_found', message: 'route not found' }, 404));

  // ── modules ──────────────────────────────────────────────────────────────
  app.route('/v1/health', healthRoutes);

  // ── API reference (non-prod only) ────────────────────────────────────────
  if (config.NODE_ENV !== 'production') {
    app.doc('/openapi.json', {
      openapi: '3.1.0',
      info: { title: 'Arad CRM-OS API', version: '0.0.0' },
    });
    app.get('/docs', apiReference({ spec: { url: '/openapi.json' }, theme: 'default' }));
  }

  return app;
};

export type App = ReturnType<typeof createApp>;
