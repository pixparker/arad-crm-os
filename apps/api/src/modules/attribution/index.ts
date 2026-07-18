// Attribution (the linchpin 🔒): one immutable demo link per seller. Scan =
// permanent اسناد; commission on EVERY future payment traces back here.

import { randomBytes } from 'node:crypto';
import { myAttributionLinkResponseSchema } from '@arad-crm/api-contracts';
import { config } from '@arad-crm/config';
import { attributionLinks, db, orgScope } from '@arad-crm/db';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireActor, session } from '../../middleware/session.js';

const newToken = (): string => randomBytes(9).toString('base64url'); // 12 chars, URL-safe

export const attributionRoutes = new Hono().use('*', session()).get('/my-link', async (c) => {
  const actor = requireActor(c);
  const existing = (
    await db
      .select()
      .from(attributionLinks)
      .where(
        and(
          orgScope(attributionLinks.organizationId, actor.orgId),
          eq(attributionLinks.sellerId, actor.userId),
        ),
      )
  )[0];
  const link =
    existing ??
    (
      await db
        .insert(attributionLinks)
        .values({ organizationId: actor.orgId, sellerId: actor.userId, token: newToken() })
        .onConflictDoNothing({
          target: [attributionLinks.organizationId, attributionLinks.sellerId],
        })
        .returning()
    )[0] ??
    // lost the insert race → the row exists now
    (
      await db
        .select()
        .from(attributionLinks)
        .where(
          and(
            orgScope(attributionLinks.organizationId, actor.orgId),
            eq(attributionLinks.sellerId, actor.userId),
          ),
        )
    )[0];
  if (!link) throw new Error('attribution link unavailable');
  return c.json(
    myAttributionLinkResponseSchema.parse({
      token: link.token,
      demo_url: `${config.DEMO_LINK_BASE}?ref=${link.token}`,
    }),
  );
});
