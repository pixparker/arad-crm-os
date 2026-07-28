// E01-F07 — the unified ＋ menu, served as a typed registry rather than
// hardcoded in each app. The founder's list: سرنخ · مشتری · فرصت · تماس و
// اطلاعات. «سفارش» (orders) is deliberately absent — Mizro's sale is a payment
// event, not a manual order — and lands here as one more entry when the
// payments work arrives, without a redesign.
//
// Entries are never hidden by role: an entry the actor may not use ships with
// `enabled: false` so the menu stays the same shape for everyone and the UI
// can explain why rather than silently omitting an option.
//
// 🔒 The registry is also the contract for the sheet's LAYOUT (group) and its
// icons — so a vertical adds an entry by adding a row here, and the app needs
// no release. What is NOT here does not exist: the prototype draws «سفارش»,
// «کار / یادآور» and «واردکردن از نقشه», and none of the three has an
// endpoint, so the sheet must not offer them (see the epic §6).

import { quickAddRegistrySchema } from '@arad-crm/api-contracts';
import { Hono } from 'hono';
import { isSeller, requireActor, session } from '../../middleware/session.js';

export const quickAddRoutes = new Hono().use('*', session()).get('/', async (c) => {
  const actor = requireActor(c);
  const seller = isSeller(actor.role);
  const manager = actor.role === 'sales_manager' || actor.role === 'owner_admin';
  const canCreate = seller || manager;

  return c.json(
    quickAddRegistrySchema.parse({
      entries: [
        {
          key: 'lead',
          kind: 'lead',
          group: 'create',
          icon: 'lead',
          label: 'سرنخ',
          hint: 'کسب‌وکاری که تازه پیدا کرده‌اید',
          endpoint: '/v1/leads',
          defaults: {},
          enabled: canCreate,
        },
        {
          key: 'opportunity',
          kind: 'opportunity',
          group: 'create',
          icon: 'opportunity',
          label: 'فرصت',
          hint: 'نیاز و تناسب تأیید شده',
          endpoint: '/v1/opportunities',
          defaults: {},
          enabled: canCreate,
        },
        {
          key: 'customer',
          kind: 'customer',
          group: 'create',
          icon: 'customer',
          label: 'مشتری',
          hint: 'پرونده‌ای که از قبل می‌شناسید',
          endpoint: '/v1/accounts',
          defaults: {},
          enabled: canCreate,
        },
        {
          key: 'note',
          kind: 'info',
          group: 'create',
          icon: 'note',
          label: 'یادداشت',
          hint: 'نکته یا واقعیتی دربارهٔ مشتری',
          endpoint: '/v1/activities',
          defaults: { kind: 'note' },
          enabled: true,
        },
        // Same endpoint, two entries — a call and a visit are the same row in
        // `activities` and two different things to a seller standing outside a café.
        {
          key: 'call',
          kind: 'touch',
          group: 'activity',
          icon: 'call',
          label: 'ثبت تماس',
          hint: 'نتیجهٔ تماس + قدم بعدی',
          endpoint: '/v1/activities',
          defaults: { kind: 'call' },
          enabled: true,
        },
        {
          key: 'visit',
          kind: 'touch',
          group: 'activity',
          icon: 'visit',
          label: 'ثبت بازدید',
          hint: 'حضور در محل + نتیجه',
          endpoint: '/v1/activities',
          defaults: { kind: 'visit' },
          enabled: true,
        },
      ],
    }),
  );
});
