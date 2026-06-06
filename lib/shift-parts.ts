import type { NewShiftPart, ShiftPart } from "@/lib/db/schema";

export type WorkShiftPart = Pick<ShiftPart, "code" | "label" | "startTime" | "endTime" | "sortOrder">;

export const MAX_SHIFT_PARTS = 6;
export const SHIFT_DURATION_HOURS = 9;

export const DEFAULT_SHIFT_PARTS = [
  { code: "open", label: "오픈", startTime: "09:00", endTime: "18:00", sortOrder: 0, isActive: true },
  { code: "middle", label: "미들", startTime: "12:00", endTime: "21:00", sortOrder: 1, isActive: true },
  { code: "close", label: "마감", startTime: "15:00", endTime: "00:00", sortOrder: 2, isActive: true },
] satisfies NewShiftPart[];

export function isHalfHourTime(value: string): boolean {
  return /^([01]\d|2[0-3]):(00|30)$/.test(value);
}

export function addNineHours(startTime: string): string {
  const [hour, minute] = startTime.split(":").map(Number);
  const totalMinutes = (hour * 60 + minute + SHIFT_DURATION_HOURS * 60) % (24 * 60);
  const nextHour = Math.floor(totalMinutes / 60);
  const nextMinute = totalMinutes % 60;

  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

export function sortShiftParts<T extends Pick<WorkShiftPart, "sortOrder" | "label">>(parts: T[]): T[] {
  return [...parts].sort((a, b) => {
    const orderDiff = a.sortOrder - b.sortOrder;
    return orderDiff || a.label.localeCompare(b.label, "ko");
  });
}

export function getShiftPartLabel(shiftParts: WorkShiftPart[], code: string): string {
  return shiftParts.find((part) => part.code === code)?.label ?? code;
}

export function getShiftPartOrder(shiftParts: WorkShiftPart[], code: string): number {
  if (code === "off") return Number.MAX_SAFE_INTEGER;
  const index = shiftParts.findIndex((part) => part.code === code);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER - 1;
}
