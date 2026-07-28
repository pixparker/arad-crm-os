// The opportunities module's service surface: the wire projection, shared with
// the lead detail screen (which lists the deals a lead produced).

import { type Opportunity, opportunitySchema } from '@arad-crm/api-contracts';
import type { opportunities } from '@arad-crm/db';

export const opportunityView = (
  o: typeof opportunities.$inferSelect,
  accountName: string,
  ownerName: string | null,
): Opportunity =>
  opportunitySchema.parse({
    id: o.id,
    account_id: o.accountId,
    account_name: accountName,
    owner_id: o.ownerId,
    owner_name: ownerName,
    stage: o.stage,
    status: o.status,
    amount_estimate_rial: o.amountEstimateRial?.toString() ?? null,
    win_reason: o.winReason,
    loss_reason: o.lossReason,
    won_at: o.wonAt?.toISOString() ?? null,
    created_at: o.createdAt.toISOString(),
  });
