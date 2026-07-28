// «امروز» means today in Tehran, not today in UTC.
//
// 🔒 Day boundaries were computed with `new Date().setHours(0,0,0,0)` — the
// SERVER's local midnight. In dev that is Tehran and looks right; in the
// production container it is UTC, so "today" would start at 03:30 Tehran and
// end at 03:29 the next morning. A seller's 8pm follow-up would sit under
// tomorrow, and an overdue item would stop looking overdue for three and a
// half hours every night. Storage stays UTC `timestamptz` (CLAUDE.md); only
// the boundaries are localized.
//
// Iran has had no DST since 2022, but the offset is read from the instant
// rather than hardcoded, so a policy change does not silently shift the day.

const TZ = 'Asia/Tehran';

const clockParts = (at: Date): { hour: number; minute: number; second: number } => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const value = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // 'en-US' with hour12:false renders midnight as 24 in some ICU versions.
  return { hour: value('hour') % 24, minute: value('minute'), second: value('second') };
};

/** The instant Tehran's current day began. */
export const startOfDayTehran = (at: Date = new Date()): Date => {
  const { hour, minute, second } = clockParts(at);
  const elapsedMs = ((hour * 60 + minute) * 60 + second) * 1000 + at.getMilliseconds();
  return new Date(at.getTime() - elapsedMs);
};

/** The last instant of Tehran's current day. */
export const endOfDayTehran = (at: Date = new Date()): Date =>
  new Date(startOfDayTehran(at).getTime() + 86_400_000 - 1);

/**
 * The instant the current Jalali month began in Tehran — what «این ماه» means
 * to a seller reading a commission total. Derived from the Persian calendar
 * day-of-month rather than a conversion table, so it stays correct across leap
 * years without a date library.
 */
export const startOfJalaliMonthTehran = (at: Date = new Date()): Date => {
  const dayOfMonth = Number(
    new Intl.DateTimeFormat('en-u-ca-persian', { timeZone: TZ, day: 'numeric' }).format(at),
  );
  return new Date(startOfDayTehran(at).getTime() - (dayOfMonth - 1) * 86_400_000);
};
