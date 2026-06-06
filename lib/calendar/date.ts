const DAY_MS = 24 * 60 * 60 * 1000;

function readDateParts(value: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string): Date {
  const parts = readDateParts(value);
  if (!parts) return new Date(Number.NaN);

  return new Date(parts.year, parts.month - 1, parts.day);
}

export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const parts = readDateParts(value);
  if (!parts) return false;

  const date = parseLocalDate(value);
  return (
    date.getFullYear() === parts.year &&
    date.getMonth() === parts.month - 1 &&
    date.getDate() === parts.day
  );
}

export function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function daysBetween(dateA: string, dateB: string): number {
  const a = readDateParts(dateA);
  const b = readDateParts(dateB);

  if (!a || !b) return Number.NaN;

  const aTime = Date.UTC(a.year, a.month - 1, a.day);
  const bTime = Date.UTC(b.year, b.month - 1, b.day);

  return Math.round((aTime - bTime) / DAY_MS);
}
