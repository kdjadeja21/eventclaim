import { addDays, format, isValid, parse, startOfDay } from "date-fns";

/** Inclusive window: today through today + N days. */
export const EVENT_DATE_MAX_DAYS_AHEAD = 30;

export function getEventDateBounds(now = new Date()): {
  minDate: Date;
  maxDate: Date;
} {
  const minDate = startOfDay(now);
  const maxDate = addDays(minDate, EVENT_DATE_MAX_DAYS_AHEAD);
  return { minDate, maxDate };
}

export function formatEventDateValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseEventDateValue(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  if (!isValid(parsed)) return undefined;
  // Reject impossible calendar dates that date-fns may roll over.
  if (format(parsed, "yyyy-MM-dd") !== value) return undefined;
  return startOfDay(parsed);
}

export function isEventDateInRange(
  value: string,
  now = new Date()
): boolean {
  const date = parseEventDateValue(value);
  if (!date) return false;
  const { minDate, maxDate } = getEventDateBounds(now);
  return date >= minDate && date <= maxDate;
}

export function eventDateRangeErrorMessage(): string {
  return `Date must be today or within the next ${EVENT_DATE_MAX_DAYS_AHEAD} days`;
}
