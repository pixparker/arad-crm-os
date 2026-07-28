// fa label lookups. Vertical vocabularies come from @arad-crm/vertical-mizro
// presets (single source); this file only adds UI-side display maps for codes
// the presets don't label (statuses, findings options, activity kinds).

import {
  LOSS_REASONS,
  NEXT_ACTION_TYPES,
  OPPORTUNITY_STAGES,
  VISIT_OUTCOMES,
} from '@arad-crm/vertical-mizro';

const byCode = (list: readonly { code: string; label: string }[], code: string): string =>
  list.find((x) => x.code === code)?.label ?? code;

export const outcomeLabel = (code: string): string => byCode(VISIT_OUTCOMES, code);
export const nextActionLabel = (code: string): string => byCode(NEXT_ACTION_TYPES, code);
export const stageLabel = (code: string): string => byCode(OPPORTUNITY_STAGES, code);
export const lossReasonLabel = (code: string): string => byCode(LOSS_REASONS, code);

// The role a person holds in the active workspace, as they would say it out
// loud. `visitor_seller` is a code; «فروشندهٔ میدانی» is what is on their card.
export const ROLE_FA: Record<string, string> = {
  visitor_seller: 'فروشندهٔ میدانی',
  followup_seller: 'فروشندهٔ پیگیری',
  sales_manager: 'مدیر فروش',
  owner_admin: 'مدیر کسب‌وکار',
  deployment_ops: 'کارشناس استقرار',
  finance: 'مالی',
};

export const CONTRACT_TYPE_FA: Record<string, string> = {
  full_time: 'تمام‌وقت',
  part_time: 'پاره‌وقت',
};

export const ACCOUNT_STATUS_FA: Record<string, string> = {
  prospect: 'پراسپکت',
  in_funnel: 'در قیف',
  customer: 'مشتری فعال',
  inactive: 'غیرفعال',
};

export const ACTIVITY_KIND_FA: Record<string, string> = {
  visit: 'بازدید',
  call: 'تماس',
  sms: 'پیامک',
  note: 'یادداشت',
  system: 'سیستم',
};

// findings quick-select vocabularies (vertical findings schema)
export const SEGMENT_OPTIONS: readonly { code: string; label: string }[] = [
  { code: 'luxury', label: 'لوکس' },
  { code: 'modern', label: 'مدرن' },
  { code: 'traditional', label: 'سنتی' },
  { code: 'casual', label: 'معمولی' },
] as const;

export const OFFER_HINT_OPTIONS: readonly { code: string; label: string }[] = [
  { code: 'vip', label: 'VIP' },
  { code: 'pro', label: 'پرو' },
  { code: 'standard', label: 'استاندارد' },
  { code: 'basic', label: 'پایه' },
] as const;

export const CURRENT_MENU_OPTIONS: readonly { code: string; label: string }[] = [
  { code: 'none', label: 'ندارد' },
  { code: 'paper', label: 'کاغذی' },
  { code: 'competitor_digital', label: 'رقیب دیجیتال' },
  { code: 'old_own', label: 'قدیمی خودشان' },
] as const;

export const segmentLabel = (code: string): string => byCode(SEGMENT_OPTIONS, code);
export const offerHintLabel = (code: string): string => byCode(OFFER_HINT_OPTIONS, code);
export const currentMenuLabel = (code: string): string => byCode(CURRENT_MENU_OPTIONS, code);

export const COMMISSION_STATUS_FA: Record<string, string> = {
  estimated: 'برآوردی',
  pending_finalization: 'در انتظار نهایی‌شدن',
  earned: 'کسب‌شده',
  approved: 'تأییدشده',
  payable: 'قابل پرداخت',
  paid: 'پرداخت‌شده',
  reversed: 'برگشت‌خورده',
  disputed: 'مورد اختلاف',
};

export const SUBSCRIPTION_STATUS_FA: Record<string, string> = {
  active: 'فعال',
  trial: 'آزمایشی',
  expired: 'منقضی',
  canceled: 'لغوشده',
  past_due: 'پرداخت عقب‌افتاده',
};
