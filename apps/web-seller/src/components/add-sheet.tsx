'use client';

// The ＋ overlay (prototype, «چه چیزی اضافه کنیم؟») — rendered from
// `GET /v1/quick-add`, never from a list in this file. The registry decides
// what exists, which block it belongs to (tiles vs rows) and which icon it
// carries, so a vertical adds an entry server-side without an app release.
//
// Two honesty rules the prototype could not express, because a prototype has
// no backend to be honest about:
//   · `enabled: false` from the server means the ROLE may not create it. The
//     entry stays visible and says so — a menu that changes shape per person
//     is a menu nobody learns.
//   · an entry whose form screen is not built yet is shown «به‌زودی» and does
//     not navigate. Better a visible gap than a tap into a 404.
//
// The prototype also draws «سفارش», «کار / یادآور» and «واردکردن از نقشه».
// None of the three exists in the API (epic §6 defers orders and the
// automation engine), so the sheet does not offer them: the ＋ must only
// promise what the system can actually do.

import { faNum } from '@/lib/format';
import type { QuickAddRegistry } from '@arad-crm/api-contracts';
import { BottomSheet, dismissSheet } from '@arad-crm/ui';
import { apiFetch } from '@arad-crm/web-shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';

type Entry = QuickAddRegistry['entries'][number];

// Where each registry entry's form lives in this app. `null` = not built yet.
const ROUTES: Record<string, string | null> = {
  lead: '/leads/new',
  opportunity: '/opportunities/new',
  customer: '/accounts/new',
  note: '/log/new?kind=note',
  call: '/log/new?kind=call',
  visit: '/log/new?kind=visit',
};

const ICONS: Record<Entry['icon'], ReactNode> = {
  lead: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  opportunity: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.6" />
    </>
  ),
  customer: (
    <>
      <path d="M4 21V9l8-6 8 6v12" />
      <path d="M4 12h16M9.5 21v-5h5v5" />
    </>
  ),
  note: (
    <>
      <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M14 4v6h6M7.5 14h7M7.5 17.5h4" />
    </>
  ),
  call: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
  ),
  visit: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="2.8" />
    </>
  ),
};

const TINTS: Record<Entry['icon'], string> = {
  lead: 'bg-primary-soft text-primary-ink',
  opportunity: 'bg-info-soft text-info',
  customer: 'bg-gold-soft text-gold',
  note: 'bg-surface-2 text-fg-muted',
  call: 'bg-primary-soft text-primary-ink',
  visit: 'bg-info-soft text-info',
};

function Glyph({ icon, className }: { icon: Entry['icon']; className: string }) {
  return (
    <span className={`grid place-items-center rounded-md ${TINTS[icon]} ${className}`}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {ICONS[icon]}
      </svg>
    </span>
  );
}

/** Why an entry cannot be tapped — null when it can. */
const blockedReason = (entry: Entry): string | null => {
  if (!entry.enabled) return 'دسترسی ندارید';
  if (!ROUTES[entry.key]) return 'به‌زودی';
  return null;
};

export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const registry = useQuery({
    queryKey: ['quick-add'],
    queryFn: () => apiFetch<QuickAddRegistry>('/v1/quick-add'),
    staleTime: 10 * 60_000,
    enabled: open,
  });

  const entries = registry.data?.entries ?? [];
  const tiles = entries.filter((e) => e.group === 'create');
  const rows = entries.filter((e) => e.group === 'activity');

  // Tapping a tile is a dismissal followed by a navigation, in that order.
  // Navigating first would push the route on top of the sheet's own history
  // entry, and the seller's next Back press would land them right back in the
  // sheet they thought they had left. So: ask the sheet to close through the
  // same path Back uses, then navigate once it actually has.
  const pendingRoute = useRef<string | null>(null);
  useEffect(() => {
    if (open || pendingRoute.current === null) return;
    const route = pendingRoute.current;
    pendingRoute.current = null;
    router.push(route);
  }, [open, router]);

  const go = (entry: Entry) => {
    const route = ROUTES[entry.key];
    if (!route || !entry.enabled) return;
    pendingRoute.current = route;
    dismissSheet();
  };

  return (
    <BottomSheet
      open={open}
      title="چه چیزی اضافه کنیم؟"
      description="هر رکورد جدید بلافاصله «قدم بعدی» می‌گیرد تا پیگیری از دست نرود."
      onClose={onClose}
    >
      {registry.isPending ? (
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-[92px] rounded-md" />
          ))}
        </div>
      ) : registry.isError ? (
        <div className="rounded-md border border-border bg-surface-2 p-4 text-center text-[13px] text-fg-muted">
          فهرست ثبت بارگیری نشد.
          <button
            type="button"
            onClick={() => registry.refetch()}
            className="ms-2 font-semibold text-primary-ink"
          >
            تلاش دوباره
          </button>
        </div>
      ) : (
        <>
          <p className="mb-2 text-[11px] font-semibold text-fg-faint">ثبت جدید</p>
          <div className="grid grid-cols-3 gap-2.5">
            {tiles.map((entry) => {
              const blocked = blockedReason(entry);
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => go(entry)}
                  disabled={blocked !== null}
                  title={entry.hint}
                  className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-md border border-border bg-surface p-3 text-center transition active:scale-[0.98] disabled:opacity-60"
                >
                  <Glyph icon={entry.icon} className="h-11 w-11" />
                  <span className="text-[13px] font-semibold leading-tight">{entry.label}</span>
                  {blocked !== null && (
                    <span className="text-[10px] font-medium text-fg-faint">{blocked}</span>
                  )}
                </button>
              );
            })}
          </div>

          {rows.length > 0 && (
            <>
              <p className="mb-2 mt-5 text-[11px] font-semibold text-fg-faint">
                ثبت فعالیت روی یک پرونده
              </p>
              <div className="overflow-hidden rounded-md border border-border">
                {rows.map((entry, i) => {
                  const blocked = blockedReason(entry);
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => go(entry)}
                      disabled={blocked !== null}
                      className={`flex w-full items-center gap-3 bg-surface p-3 text-start transition active:bg-surface-2 disabled:opacity-60 ${
                        i > 0 ? 'border-t border-border' : ''
                      }`}
                    >
                      <Glyph icon={entry.icon} className="h-9 w-9" />
                      <span className="flex-1">
                        <span className="block text-[13px] font-semibold">{entry.label}</span>
                        <span className="block text-[11px] text-fg-muted">{entry.hint}</span>
                      </span>
                      {blocked !== null ? (
                        <span className="text-[10px] font-medium text-fg-faint">{blocked}</span>
                      ) : (
                        <svg
                          width="17"
                          height="17"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          className="text-fg-faint"
                        >
                          <path d="m15 18-6-6 6-6" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {entries.length === 0 && (
            <p className="text-center text-[13px] text-fg-muted">
              فعلاً موردی برای ثبت در دسترس نیست.
            </p>
          )}
        </>
      )}
      <p className="mt-4 text-center text-[11px] text-fg-faint">
        {faNum(tiles.length + rows.length)} مورد
      </p>
    </BottomSheet>
  );
}
