import { addLocalDays, formatLocalDate, parseLocalDate } from "@/lib/calendar/date";

export const FAIRNESS_HISTORY_WEEKS = 8;

export function getFairnessHistoryStartDate(referenceDate: string, weeks = FAIRNESS_HISTORY_WEEKS): string {
  return formatLocalDate(addLocalDays(parseLocalDate(referenceDate), -weeks * 7));
}
