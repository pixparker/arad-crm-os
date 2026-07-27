// Ops control plane (ADR-014) — Arad's own surface, mounted at /v1/ops and
// served to `ops.aradap.ir`. 🔒 Every route here is behind the OPS identity
// axis (`opsSession` + `requireOpsRole`), which is checked against
// `ops_user_roles` and never against `org_members`.
//
// Login itself is the shared /v1/auth OTP flow: one platform identity, two
// authorization axes. `/v1/ops/me` is how the ops app learns whether the
// person who just logged in has the ops axis at all.

import { opsMeResponseSchema } from '@arad-crm/api-contracts';
import { Hono } from 'hono';
import { opsSession, requireOpsActor } from '../../middleware/ops-session.js';
import { opsBusinessRoutes } from './businesses.js';
import { opsConnectionRoutes } from './connections.js';
import { opsObservabilityRoutes } from './observability.js';
import { opsStaffRoutes } from './ops-users.js';
import { opsSettingsRoutes } from './settings.js';
import { opsUserRoutes } from './users.js';

export const opsRoutes = new Hono()
  .use('*', opsSession())
  .get('/me', async (c) => {
    const actor = requireOpsActor(c);
    return c.json(
      opsMeResponseSchema.parse({
        user: { id: actor.userId, phone: actor.phone, display_name: actor.displayName },
        roles: actor.roles,
      }),
    );
  })
  .route('/businesses', opsBusinessRoutes)
  .route('/users', opsUserRoutes)
  .route('/ops-users', opsStaffRoutes)
  .route('/connections', opsConnectionRoutes)
  .route('/settings', opsSettingsRoutes)
  .route('/', opsObservabilityRoutes);
