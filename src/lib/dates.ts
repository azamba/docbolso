// Calendar dates ("YYYY-MM-DD", no time zone) for document expiry.

const DAY_MS = 86_400_000;

/** Formats digits typed so far as DD/MM/AAAA, e.g. "1203" → "12/03". */
export function maskBrDate(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "12/03/2027" → "2027-03-12", or null if it isn't a real date. */
export function parseBrDate(input: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (date.getDate() !== Number(dd) || date.getMonth() !== Number(mm) - 1) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** "2027-03-12" → "12/03/2027". */
export function formatBrDate(iso: string): string {
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

/** Local midnight of a "YYYY-MM-DD" date, at `hour` o'clock. */
export function localDate(iso: string, hour = 0): Date {
  const [yyyy, mm, dd] = iso.split('-').map(Number);
  return new Date(yyyy, mm - 1, dd, hour);
}

/** Whole days from today to `iso` (0 = today, negative = past). */
export function daysUntil(iso: string, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((localDate(iso).getTime() - today.getTime()) / DAY_MS);
}

/** Days before expiry at which a document counts as "expiring soon". */
export const EXPIRY_WARNING_DAYS = 30;

/** "Vence hoje", "Vence em 12 dias", "Venceu há 3 dias"… */
export function expiryText(iso: string): string {
  const days = daysUntil(iso);
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Vence amanhã';
  if (days === -1) return 'Venceu ontem';
  if (days < 0) return `Venceu há ${-days} dias`;
  if (days <= 60) return `Vence em ${days} dias`;
  const months = Math.round(days / 30);
  if (months < 24) return `Vence em ${months} meses`;
  return `Vence em ${Math.round(days / 365)} anos`;
}

export type ExpiryStatus = 'ok' | 'soon' | 'expired';

export function expiryStatus(iso: string): ExpiryStatus {
  const days = daysUntil(iso);
  if (days < 0) return 'expired';
  return days <= EXPIRY_WARNING_DAYS ? 'soon' : 'ok';
}
