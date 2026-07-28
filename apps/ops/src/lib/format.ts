// fa-IR display helpers for the control plane. 🔒 Dates are stored UTC and
// rendered through Intl in the Persian calendar (CLAUDE.md); nothing here does
// arithmetic on a formatted string.

import type { OpsRole, Role } from '@arad-crm/api-contracts';

const faDateTime = new Intl.DateTimeFormat('fa-IR', {
  dateStyle: 'short',
  timeStyle: 'short',
});
const faDate = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' });
const faNumberFmt = new Intl.NumberFormat('fa-IR');

export const faDateTimeOf = (iso: string | null): string =>
  iso ? faDateTime.format(new Date(iso)) : '—';

export const faDateOf = (iso: string | null): string => (iso ? faDate.format(new Date(iso)) : '—');

export const faNumber = (n: number): string => faNumberFmt.format(n);

/** Persian/Arabic-Indic digits → ASCII, so a pasted phone number still parses. */
export const normalizeDigits = (input: string): string =>
  input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export const OPS_ROLE_LABELS: Record<OpsRole, string> = {
  super_admin: 'مدیر ارشد',
  onboarding_agent: 'کارشناس استقرار',
  support: 'پشتیبانی',
  finance: 'مالی',
};

export const TENANT_ROLE_LABELS: Record<Role, string> = {
  visitor_seller: 'فروشندهٔ حضوری',
  followup_seller: 'فروشندهٔ پیگیری',
  sales_manager: 'مدیر فروش',
  owner_admin: 'مالک/ادمین',
  deployment_ops: 'استقرار',
  finance: 'مالی',
};

export const TENANT_ROLES: readonly Role[] = [
  'visitor_seller',
  'followup_seller',
  'sales_manager',
  'owner_admin',
  'deployment_ops',
  'finance',
];

export const OPS_ROLES: readonly OpsRole[] = [
  'super_admin',
  'onboarding_agent',
  'support',
  'finance',
];
