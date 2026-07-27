// Ops → platform settings (ADR-014 §3). A typed registry, not a key/value bag:
// every key is registered by the module that owns it, with a type, default and
// constraints, so this surface renders type-aware inputs and refuses an
// out-of-range write before it lands.
//
// Hot-reloadable by construction — a write drops the local cache and publishes
// a Redis invalidation, so behaviour changes without a redeploy.

import { setSettingBodySchema, settingViewSchema } from '@arad-crm/api-contracts';
import { db } from '@arad-crm/db';
import { ForbiddenError, NotFoundError } from '@arad/errors';
import { clearSetting, getAllSettings, getRegistry, setSetting } from '@arad/platform-config';
import { Hono } from 'hono';
import { requireOpsRole } from '../../middleware/ops-session.js';
import { writeOpsAudit } from './audit.js';

export const opsSettingsRoutes = new Hono()
  .get('/', async (c) => {
    requireOpsRole(c, 'support', 'finance', 'onboarding_agent');
    const views = await getAllSettings();
    return c.json({
      items: views.map((v) =>
        settingViewSchema.parse({
          key: v.key,
          type: v.type,
          value: v.value,
          default: v.default,
          group: v.group,
          description: v.description,
          access_level: v.accessLevel,
          constraints: v.constraints,
          edit_note: v.editNote,
          updated_at: v.updatedAt?.toISOString() ?? null,
          updated_by: v.updatedBy,
          is_overridden: v.isOverridden,
        }),
      ),
    });
  })

  .put('/:key', async (c) => {
    const actor = requireOpsRole(c);
    const key = c.req.param('key');
    const registry = getRegistry();
    if (!registry.has(key)) throw new NotFoundError(`setting "${key}" is not registered`);
    // 🔒 The package deliberately does not enforce access level — the route
    // does, because only the route knows who is calling.
    const spec = registry.get(key);
    if (spec.accessLevel === 'ops_read') {
      throw new ForbiddenError(`setting "${key}" is read-only`);
    }
    const body = setSettingBodySchema.parse(await c.req.json());
    const change = await setSetting(key, body.value, actor.userId);
    await writeOpsAudit(db, c, actor, {
      action: 'ops.setting.updated',
      entityType: 'app_setting',
      entityId: key,
      before: { value: change.oldValue },
      after: { value: change.newValue },
    });
    return c.json({ key: change.key, value: change.newValue });
  })

  // Reset-to-default deletes the override row, so the code default takes over
  // again — pinning the default as a value would silently freeze it.
  .delete('/:key', async (c) => {
    const actor = requireOpsRole(c);
    const key = c.req.param('key');
    if (!getRegistry().has(key)) throw new NotFoundError(`setting "${key}" is not registered`);
    const change = await clearSetting(key);
    await writeOpsAudit(db, c, actor, {
      action: 'ops.setting.reset',
      entityType: 'app_setting',
      entityId: key,
      before: { value: change.oldValue },
      after: { value: change.newValue },
    });
    return c.json({ key: change.key, value: change.newValue });
  });
