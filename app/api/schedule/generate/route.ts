import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { employees, shiftLogs } from "@/lib/db/schema";
import { getKoreaHolidaysForDates, holidayNameMap } from "@/lib/calendar/koreaHolidays";
import { generateWeekSchedule, type HolidayInput } from "@/lib/scheduler/generate";
import { and, eq, lt } from "drizzle-orm";

function buildWeekDates(startDate: string): string[] {
  const weekStart = new Date(startDate);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export async function POST(req: Request) {
  const { weekLabel, startDate, holidays = [] } = await req.json();

  const allEmployees = await db.select().from(employees).where(eq(employees.isActive, true));
  const pastLogs = await db
    .select()
    .from(shiftLogs)
    .where(and(eq(shiftLogs.isConfirmed, true), lt(shiftLogs.date, startDate)));

  const weekDates = buildWeekDates(startDate);
  const koreaHolidays = await getKoreaHolidaysForDates(weekDates);
  const holidayInputs: HolidayInput[] = Array.isArray(holidays) && holidays.length > 0
    ? holidays
    : koreaHolidays;
  const weekStart = new Date(startDate);
  const daySchedules = generateWeekSchedule(weekStart, allEmployees, pastLogs, holidayInputs);

  return NextResponse.json({ weekLabel, days: daySchedules, holidays: holidayNameMap(koreaHolidays) });
}
