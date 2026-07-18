// fa-IR formatting helpers. Money rule (MUST): Rial digit-string → Toman via
// BigInt division by 10 — never floats.

const faNumber = new Intl.NumberFormat('fa-IR');
const faFullDate = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'full' });
const faMediumDate = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' });
const faTime = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' });
const faRelative = new Intl.RelativeTimeFormat('fa-IR', { numeric: 'auto' });

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Latin → Persian digits for display of raw strings (phone numbers, …). */
export const toFaDigits = (value: string): string =>
  value.replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)] ?? d);

/** Persian/Arabic digits → Latin, for parsing user input (Persian-friendly). */
export const normalizeDigits = (value: string): string =>
  value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export const faNum = (n: number): string => faNumber.format(n);

/** Rial digit-string → Toman with fa digits + grouping (no «تومان» suffix). */
export const formatToman = (rial: string): string => faNumber.format(BigInt(rial) / 10n);

export const faDateFull = (date: Date): string => faFullDate.format(date);
export const faDate = (iso: string): string => faMediumDate.format(new Date(iso));
export const faClock = (iso: string): string => faTime.format(new Date(iso));

export const faRelativeTime = (iso: string): string => {
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(diffMin) < 60) return faRelative.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return faRelative.format(diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return faRelative.format(diffDay, 'day');
  return faRelative.format(Math.round(diffDay / 30), 'month');
};

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local (not UTC) `yyyy-mm-dd`, today + `days` — for `<input type="date">`. */
export const localDatePlusDays = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** `yyyy-mm-dd` → ISO datetime (local 10:00) for `next_action_at`. */
export const dateInputToIso = (dateStr: string): string =>
  new Date(`${dateStr}T10:00:00`).toISOString();

/** fa display of a `yyyy-mm-dd` date-input value (native inputs show Gregorian). */
export const faDateOfInput = (dateStr: string): string =>
  faMediumDate.format(new Date(`${dateStr}T12:00:00`));

export const isToday = (iso: string): boolean => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};
