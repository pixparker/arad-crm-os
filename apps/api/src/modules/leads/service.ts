// The leads module's service surface: the wire projection, shared with the
// opportunity detail screen (a deal always shows the lead it came from).

import { type Lead, leadSchema } from '@arad-crm/api-contracts';
import type { accounts, leads } from '@arad-crm/db';

export const leadView = (r: {
  lead: typeof leads.$inferSelect;
  account: typeof accounts.$inferSelect;
  assigneeName: string | null;
}): Lead =>
  leadSchema.parse({
    id: r.lead.id,
    account_id: r.account.id,
    account_name: r.account.name,
    account_phone: r.account.phone,
    region_text: r.account.regionText,
    territory_id: r.account.territoryId,
    status: r.lead.status,
    source: r.lead.source,
    assigned_to: r.lead.assignedTo,
    assigned_to_name: r.assigneeName,
    next_action_type: r.lead.nextActionType,
    next_action_at: r.lead.nextActionAt?.toISOString() ?? null,
    close_reason: r.lead.closeReason,
    requested_features: (r.lead.requestedFeatures as string[] | null) ?? null,
    created_at: r.lead.createdAt.toISOString(),
  });
