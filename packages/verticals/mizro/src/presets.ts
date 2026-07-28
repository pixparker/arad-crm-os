// Mizro cafe-vertical presets (ADR-010: config-as-data; dev spec §9–§12).
// These seed the pilot; they become org-configurable data at SaaS phase.
// Codes are stable identifiers — labels are fa-first display strings.

export interface OutcomeDef {
  code: string;
  label: string;
  // system-suggested next action (dev spec §11 mapping)
  suggestedNext: { type: string; inDays: number } | null;
  closes?: boolean;
}

// 14 standard visit/call outcomes (dev spec §11)
export const VISIT_OUTCOMES: readonly OutcomeDef[] = [
  {
    code: 'decider_met',
    label: 'ملاقات با تصمیم‌گیرنده',
    suggestedNext: { type: 'follow_up_call', inDays: 2 },
  },
  {
    code: 'decider_absent',
    label: 'تصمیم‌گیرنده حاضر نبود',
    suggestedNext: { type: 'revisit', inDays: 1 },
  },
  {
    code: 'call_later',
    label: 'گفتند بعداً تماس بگیرید',
    suggestedNext: { type: 'follow_up_call', inDays: 3 },
  },
  {
    code: 'sample_requested',
    label: 'نمونه‌کار خواستند',
    suggestedNext: { type: 'send_demo', inDays: 0 },
  },
  { code: 'demo_requested', label: 'درخواست دمو', suggestedNext: { type: 'send_demo', inDays: 0 } },
  {
    code: 'interested',
    label: 'علاقه‌مند بود',
    suggestedNext: { type: 'follow_up_call', inDays: 2 },
  },
  {
    code: 'needs_review',
    label: 'نیاز به بررسی بیشتر داشتند',
    suggestedNext: { type: 'follow_up_call', inDays: 4 },
  },
  {
    code: 'price_requested',
    label: 'قیمت خواستند',
    suggestedNext: { type: 'send_price', inDays: 0 },
  },
  {
    code: 'not_needed_now',
    label: 'فعلاً نیاز ندارند',
    suggestedNext: { type: 'follow_up_call', inDays: 30 },
  },
  {
    code: 'uses_competitor',
    label: 'از سرویس دیگری استفاده می‌کنند',
    suggestedNext: { type: 'follow_up_call', inDays: 45 },
  },
  { code: 'closed_business', label: 'کسب‌وکار تعطیل/غیرفعال', suggestedNext: null, closes: true },
  { code: 'wrong_info', label: 'اطلاعات اشتباه بود', suggestedNext: null, closes: true },
  {
    code: 'not_cooperative',
    label: 'همکاری نکردند',
    suggestedNext: { type: 'follow_up_call', inDays: 60 },
  },
  {
    code: 'revisit_needed',
    label: 'نیاز به مراجعهٔ مجدد',
    suggestedNext: { type: 'revisit', inDays: 2 },
  },
] as const;

export const NEXT_ACTION_TYPES: readonly { code: string; label: string }[] = [
  { code: 'visit', label: 'بازدید حضوری' },
  { code: 'revisit', label: 'مراجعهٔ مجدد' },
  { code: 'follow_up_call', label: 'تماس پیگیری' },
  { code: 'send_demo', label: 'ارسال لینک دمو' },
  { code: 'send_price', label: 'ارسال قیمت' },
  { code: 'send_sms', label: 'ارسال پیامک' },
  { code: 'onboarding_handoff', label: 'تحویل به استقرار' },
] as const;

// Where a lead came from (prototype screen ۰۳ §۱). `seller` is not offered as a
// choice: the api sets it when a seller introduces a lead themselves, and that
// is the attribution claim — not something a form may assert.
export const LEAD_SOURCES: readonly { code: string; label: string }[] = [
  { code: 'website_form', label: 'فرم وبسایت' },
  { code: 'map', label: 'نقشه (نشان/بلد)' },
  { code: 'referral', label: 'معرفی مشتری' },
  { code: 'inbound_call', label: 'تماس ورودی' },
  { code: 'expo', label: 'نمایشگاه' },
  { code: 'manual', label: 'سایر' },
] as const;

// What the café asked for. Multi-select, and it feeds the price conversation —
// so it is vertical vocabulary, not free text a report can never group.
export const REQUESTED_PRODUCTS: readonly { code: string; label: string }[] = [
  { code: 'digital_menu', label: 'منوی دیجیتال' },
  { code: 'table_order', label: 'سفارش روی میز' },
  { code: 'reviews', label: 'نظر مشتریان' },
  { code: 'loyalty', label: 'باشگاه مشتریان' },
  { code: 'website', label: 'وبسایت' },
] as const;

// «کِی؟» — the quick offsets on the next-action scheduler. Server-supplied to
// the guidance endpoint AND used by the capture form before a lead exists, so
// both sides offer the same choices. The founder's own examples: «۲ هفتهٔ
// دیگر», «شنبه» (which the app resolves against the Persian week).
export const NEXT_ACTION_OFFSETS: readonly { key: string; label: string; days: number }[] = [
  { key: 'today', label: 'امروز', days: 0 },
  { key: 'tomorrow', label: 'فردا', days: 1 },
  { key: 'in_3_days', label: '۳ روز دیگر', days: 3 },
  { key: 'next_week', label: 'هفتهٔ آینده', days: 7 },
  { key: 'in_2_weeks', label: '۲ هفتهٔ دیگر', days: 14 },
  { key: 'next_month', label: 'ماه آینده', days: 30 },
] as const;

// Opportunity pipeline stages (post-qualification part of the 14-stage funnel)
export const OPPORTUNITY_STAGES: readonly { code: string; label: string }[] = [
  { code: 'qualified', label: 'واجد شرایط' },
  { code: 'demo_sent', label: 'دمو ارسال شد' },
  { code: 'price_proposed', label: 'پیشنهاد قیمت' },
  { code: 'deciding', label: 'در حال تصمیم‌گیری' },
  { code: 'awaiting_payment', label: 'منتظر پرداخت' },
] as const;

export const WIN_REASONS: readonly { code: string; label: string }[] = [
  { code: 'simplicity', label: 'سادگی مدیریت منو' },
  { code: 'price_change_speed', label: 'سرعت تغییر قیمت' },
  { code: 'design', label: 'طراحی' },
  { code: 'price', label: 'قیمت' },
  { code: 'data_entry_service', label: 'خدمت ورود اطلاعات' },
  { code: 'trust', label: 'اعتماد به برند/فروشنده' },
  { code: 'referral', label: 'معرفی دیگران' },
  { code: 'support', label: 'کیفیت پشتیبانی' },
  { code: 'table_order', label: 'سفارش روی میز' },
  { code: 'qr_nfc', label: 'QR / NFC' },
  { code: 'multilingual', label: 'چندزبانه' },
  { code: 'fixes_problem', label: 'حل مشکل منوی فعلی' },
  { code: 'multi_branch', label: 'تناسب چندشعبه' },
  { code: 'convincing_demo', label: 'دموی قانع‌کننده' },
] as const;

export const LOSS_REASONS: readonly { code: string; label: string }[] = [
  { code: 'price', label: 'قیمت' },
  { code: 'no_budget', label: 'نبود بودجه' },
  { code: 'no_need', label: 'عدم نیاز' },
  { code: 'competitor', label: 'انتخاب رقیب' },
  { code: 'satisfied_current', label: 'راضی از وضع فعلی' },
  { code: 'distrust', label: 'بی‌اعتمادی' },
  { code: 'bad_timing', label: 'زمان نامناسب' },
  { code: 'no_decider_access', label: 'عدم دسترسی به تصمیم‌گیرنده' },
  { code: 'long_decision', label: 'تصمیم‌گیری طولانی' },
  { code: 'technical_worry', label: 'نگرانی فنی' },
  { code: 'missing_capability', label: 'نبود قابلیت موردنیاز' },
  { code: 'business_closed', label: 'تعطیلی کسب‌وکار' },
  { code: 'no_response', label: 'عدم پاسخ' },
  { code: 'bad_experience', label: 'تجربهٔ بد از فروشنده' },
  { code: 'mismatch', label: 'عدم تناسب محصول و مشتری' },
] as const;

export const isOutcome = (code: string): boolean => VISIT_OUTCOMES.some((o) => o.code === code);
export const isNextActionType = (code: string): boolean =>
  NEXT_ACTION_TYPES.some((n) => n.code === code);
export const isOpportunityStage = (code: string): boolean =>
  OPPORTUNITY_STAGES.some((s) => s.code === code);
export const isLossReason = (code: string): boolean => LOSS_REASONS.some((r) => r.code === code);
export const isWinReason = (code: string): boolean => WIN_REASONS.some((r) => r.code === code);
export const isLeadSource = (code: string): boolean => LEAD_SOURCES.some((s) => s.code === code);
export const isRequestedProduct = (code: string): boolean =>
  REQUESTED_PRODUCTS.some((p) => p.code === code);
