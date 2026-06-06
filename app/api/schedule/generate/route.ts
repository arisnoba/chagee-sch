import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { employees, schedules, shiftLogs } from "@/lib/db/schema";
import { getKoreaHolidaysForDates, holidayNameMap } from "@/lib/calendar/koreaHolidays";
import { generateWeekSchedule, type HolidayInput } from "@/lib/scheduler/generate";
import { getActiveShiftParts } from "@/lib/db/shiftParts";
import { and, eq, lt } from "drizzle-orm";

function buildWeekDates(startDate: string): string[] {
  const weekStart = new Date(startDate);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidWeekLabel(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-W\d{2}$/.test(value);
}

export async function POST(req: Request) {
  const { weekLabel, startDate, holidays = [] } = await req.json();

  if (!isValidWeekLabel(weekLabel)) {
    return NextResponse.json({ error: "Invalid week label" }, { status: 400 });
  }

  if (!isValidDateString(startDate)) {
    return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
  }

  const allEmployees = await db.select().from(employees).where(eq(employees.isActive, true));
  const existingSchedule = await db.select().from(schedules).where(eq(schedules.weekLabel, weekLabel));
  const pastLogs = await db
    .select()
    .from(shiftLogs)
    .where(and(eq(shiftLogs.isConfirmed, true), lt(shiftLogs.date, startDate)));

  const weekDates = buildWeekDates(startDate);
  const koreaHolidays = await getKoreaHolidaysForDates(weekDates);
  const holidayInputs: HolidayInput[] = Array.isArray(holidays) && holidays.length > 0
    ? holidays
    : koreaHolidays;
  const shiftParts = await getActiveShiftParts();
  const weekStart = new Date(startDate);
  const daySchedules = generateWeekSchedule(weekStart, allEmployees, pastLogs, holidayInputs, shiftParts);
  const warning = existingSchedule[0]?.status === "confirmed" ? "SCHEDULE_CONFIRMED" : undefined;

  return NextResponse.json({ weekLabel, days: daySchedules, holidays: holidayNameMap(koreaHolidays), shiftParts, warning });
}
