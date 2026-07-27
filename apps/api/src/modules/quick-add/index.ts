// E01-F07 — the unified ＋ menu, served as a typed registry rather than
// hardcoded in each app. The founder's list: سرنخ · مشتری · فرصت · تماس و
// اطلاعات. «سفارش» (orders) is deliberately absent — Mizro's sale is a payment
// event, not a manual order — and lands here as one more entry when the
// payments work arrives, without a redesign.
//
// Entries are never hidden by role: an entry the actor may not use ships with
// `enabled: false` so the menu stays the same shape for everyone and the UI
// can explain why rather than silently omitting an option.

import { quickAddRegistrySchema } from '@arad-crm/api-contracts';
import { Hono } from 'hono';
import { isSeller, requireActor, session } from '../../middleware/session.js';

export const quickAddRoutes = new Hono().use('*', session()).get('/', async (c) => {
  const actor = requireActor(c);
  const seller = isSeller(actor.role);
  const manager = actor.role === 'sales_manager' || actor.role === 'owner_admin';

  return c.json(
    quickAddRegistrySchema.parse({
      entries: [
        {
          kind: 'lead',
          label: 'سرنخ جدید',
          hint: 'کسب‌وکاری که تازه پیدا کرده‌اید',
          endpoint: '/v1/leads',
          enabled: seller || manager,
        },
        {
          kind: 'customer',
          label: 'مشتری',
          hint: 'پرونده‌ای که از قبل می‌شناسید',
          endpoint: '/v1/accounts',
          enabled: seller || manager,
        },
        {
          kind: 'opportunity',
          label: 'فرصت',
          hint: 'نیاز و تناسب تأیید شده',
          endpoint: '/v1/opportunities',
          enabled: seller || manager,
        },
        {
          kind: 'touch',
          label: 'تماس / بازدید',
          hint: 'چیزی که همین حالا اتفاق افتاد',
          endpoint: '/v1/activities',
          enabled: true,
        },
        {
          kind: 'info',
          label: 'اطلاعات',
          hint: 'نکته یا واقعیتی دربارهٔ مشتری',
          endpoint: '/v1/activities',
          enabled: true,
        },
      ],
    }),
  );
});
