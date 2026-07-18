// fa-IR display helpers. Money travels as Rial digit-strings (bigint on the
// wire) — the UI always shows Toman (÷10) with fa digits; dates render in the
// Persian calendar via Intl.

import type {
  ContractType,
  Role,
  commissionEntrySchema,
  commissionEntryStatusSchema,
  leadStatusSchema,
} from '@arad-crm/api-contracts';
import { NEXT_ACTION_TYPES, OPPORTUNITY_STAGES } from '@arad-crm/vertical-mizro';
import type { z } from 'zod';

export type LeadStatus = z.infer<typeof leadStatusSchema>;
export type CommissionStatus = z.infer<typeof commissionEntryStatusSchema>;
export type CommissionEntryType = z.infer<typeof commissionEntrySchema>['entry_type'];

const faNum = new Intl.NumberFormat('fa-IR');
const faDateFmt = new Intl.DateTimeFormat('fa-IR', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
const faDateTimeFmt = new Intl.DateTimeFormat('fa-IR', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const faNumber = (n: number | bigint): string => faNum.format(n);

/** Rial digit-string → Toman bigint (truncating the single rial digit). */
export const rialToToman = (rial: string): bigint => BigInt(rial) / 10n;

/** Rial digit-string → «۱٬۲۳۴» (Toman, fa digits, signed). */
export const formatToman = (rial: string): string => faNum.format(rialToToman(rial));

export const faDate = (iso: string): string => faDateFmt.format(new Date(iso));
export const faDateTime = (iso: string): string => faDateTimeFmt.format(new Date(iso));

/** fa/ar-indic digits → ASCII, so pasted/typed fa numbers parse. */
export const normalizeDigits = (s: string): string =>
  s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

// ── fa label maps ───────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<Role, string> = {
  visitor_seller: 'بازدیدکننده',
  followup_seller: 'پیگیری',
  sales_manager: 'مدیر فروش',
  owner_admin: 'مالک',
  deployment_ops: 'استقرار',
  finance: 'مالی',
};

export const CONTRACT_LABELS: Record<ContractType, string> = {
  full_time: 'تمام‌وقت',
  part_time: 'پاره‌وقت',
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'جدید',
  assigned: 'تخصیص‌یافته',
  in_progress: 'در حال پیگیری',
  qualified: 'واجد شرایط',
  lost: 'از دست رفته',
  future_followup: 'پیگیری آینده',
};

export type ChipTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export const LEAD_STATUS_TONES: Record<LeadStatus, ChipTone> = {
  new: 'primary',
  assigned: 'neutral',
  in_progress: 'warning',
  qualified: 'success',
  lost: 'danger',
  future_followup: 'neutral',
};

export const MEMBER_STATUS_LABELS: Record<'invited' | 'active' | 'disabled', string> = {
  invited: 'دعوت‌شده',
  active: 'فعال',
  disabled: 'غیرفعال',
};

export const MEMBER_STATUS_TONES: Record<'invited' | 'active' | 'disabled', ChipTone> = {
  invited: 'warning',
  active: 'success',
  disabled: 'neutral',
};

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  estimated: 'برآوردی',
  pending_finalization: 'در انتظار قطعی‌شدن',
  earned: 'کسب‌شده',
  approved: 'تأییدشده',
  payable: 'قابل پرداخت',
  paid: 'پرداخت‌شده',
  reversed: 'برگشت‌خورده',
  disputed: 'مورد اختلاف',
};

export const COMMISSION_STATUS_TONES: Record<CommissionStatus, ChipTone> = {
  estimated: 'neutral',
  pending_finalization: 'neutral',
  earned: 'primary',
  approved: 'warning',
  payable: 'warning',
  paid: 'success',
  reversed: 'danger',
  disputed: 'danger',
};

export const ENTRY_TYPE_LABELS: Record<CommissionEntryType, string> = {
  earn: 'کسب',
  reversal: 'کلاوبک',
  adjustment: 'اصلاح',
};

const SOURCE_LABELS: Record<string, string> = {
  csv_import: 'فایل',
  manual: 'دستی',
  seller: 'فروشنده',
  neshan: 'نشان',
  balad: 'بلد',
  google_maps: 'گوگل‌مپ',
};

export const sourceLabel = (code: string): string => SOURCE_LABELS[code] ?? code;

export const stageLabel = (code: string): string =>
  OPPORTUNITY_STAGES.find((s) => s.code === code)?.label ?? code;

export const nextActionLabel = (code: string): string =>
  NEXT_ACTION_TYPES.find((n) => n.code === code)?.label ?? code;

export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  prospect: 'سرنخ خام',
  in_funnel: 'در قیف',
  customer: 'مشتری',
  inactive: 'غیرفعال',
};
