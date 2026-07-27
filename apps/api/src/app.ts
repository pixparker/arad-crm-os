// App composition (ADR-003/008): OpenAPIHono under /v1, module routes mounted
// here, AradError mapped centrally, OpenAPI + Scalar docs outside production.
// Module slices live in src/modules/<module>/ — see src/modules/README.md.

import { CORRELATION_HEADER, IDEMPOTENCY_HEADER } from '@arad-crm/api-contracts';
import { config } from '@arad-crm/config';
import { AradError, toHttpError } from '@arad/errors';
import { logger } from '@arad/logger';
import { OpenAPIHono } from '@hono/zod-openapi';
import { apiReference } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { ZodError } from 'zod';
import { correlationId } from './middleware/correlation-id.js';
import { accountsRoutes } from './modules/accounts/index.js';
import { activitiesRoutes } from './modules/activities/index.js';
import { attributionRoutes } from './modules/attribution/index.js';
import { commissionRoutes } from './modules/commission/index.js';
import { flowsRoutes } from './modules/flows/index.js';
import { healthRoutes } from './modules/health/index.js';
import { identityRoutes } from './modules/identity/index.js';
import { integrationsRoutes } from './modules/integrations/index.js';
import { leadsRoutes } from './modules/leads/index.js';
import { opportunitiesRoutes } from './modules/opportunities/index.js';
import { opsRoutes } from './modules/ops/index.js';
import { orgRoutes } from './modules/org/index.js';
import { quickAddRoutes } from './modules/quick-add/index.js';
import { reportsRoutes } from './modules/reports/index.js';

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

  // CORS 🔒 credentialed cross-origin from the web apps. Explicit origin
  // allowlist (WEB_ORIGINS) — '*' is illegal with credentials:true. Handles the
  // preflight for the custom correlation/idempotency headers apiFetch sends.
  // Server-to-server callers (Mizro webhook) send no Origin, so this never
  // touches them.
  app.use(
    '*',
    cors({
      origin: config.WEB_ORIGINS,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['content-type', CORRELATION_HEADER, IDEMPOTENCY_HEADER],
      maxAge: 86400,
    }),
  );

  app.use('*', correlationId());

  app.onError((err, c) => {
    const cid = c.get('correlationId');
    if (err instanceof ZodError) {
      return c.json(
        { code: 'validation_error', message: 'invalid request', meta: { issues: err.issues } },
        400,
      );
    }
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
  app.route('/v1/auth', identityRoutes);
  app.route('/v1/org', orgRoutes);
  app.route('/v1/accounts', accountsRoutes);
  app.route('/v1/leads', leadsRoutes);
  app.route('/v1/activities', activitiesRoutes);
  app.route('/v1/opportunities', opportunitiesRoutes);
  app.route('/v1/attribution', attributionRoutes);
  app.route('/v1/commission', commissionRoutes);
  app.route('/v1/reports', reportsRoutes);
  app.route('/v1/flows', flowsRoutes);
  app.route('/v1/quick-add', quickAddRoutes);
  app.route('/v1/integrations', integrationsRoutes);
  // 🔒 Ops control plane — the OPS identity axis, not a tenant surface
  // (ADR-014). Served to ops.aradap.ir; every route inside re-checks the axis.
  app.route('/v1/ops', opsRoutes);

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
