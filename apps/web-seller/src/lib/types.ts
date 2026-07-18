// Response types derived from the wire contracts (single source of truth).
// `ReturnType<typeof schema.parse>` gives us the inferred output type without
// re-declaring shapes (contracts-enums guard) and without a direct zod dep.

import type {
  activitySchema,
  commissionEntrySchema,
  myAttributionLinkResponseSchema,
  myCommissionResponseSchema,
  opportunitySchema,
  requestOtpResponseSchema,
  todayResponseSchema,
} from '@arad-crm/api-contracts';

export type { Account, Lead, MeResponse, Role } from '@arad-crm/api-contracts';
import type { Account, Lead } from '@arad-crm/api-contracts';

export type Activity = ReturnType<typeof activitySchema.parse>;
export type Opportunity = ReturnType<typeof opportunitySchema.parse>;
export type TodayResponse = ReturnType<typeof todayResponseSchema.parse>;
export type CommissionEntry = ReturnType<typeof commissionEntrySchema.parse>;
export type MyCommissionResponse = ReturnType<typeof myCommissionResponseSchema.parse>;
export type MyAttributionLink = ReturnType<typeof myAttributionLinkResponseSchema.parse>;
export type RequestOtpResponse = ReturnType<typeof requestOtpResponseSchema.parse>;

export interface ItemsResponse<T> {
  items: T[];
}
export type LeadsResponse = ItemsResponse<Lead>;
export type AccountsResponse = ItemsResponse<Account>;
export type OpportunitiesResponse = ItemsResponse<Opportunity>;

export interface AccountDetailResponse {
  account: Account;
  timeline: Activity[];
  // ★ معرِّف — immutable attribution claim
  attribution: { seller_id: string; seller_name: string; first_touch_at: string } | null;
}
