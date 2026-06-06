import { NextResponse } from "next/server";
import { apiError, apiInternalError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { employees, schedules, shiftLogs } from "@/lib/db/schema";
import { getKoreaHolidaysForDatesWithStatus, holidayNameMap } from "@/lib/calendar/koreaHolidays";
import { addLocalDays, formatLocalDate, isValidDateString, parseLocalDate } from "@/lib/calendar/date";
import { generateWeekSchedule, type HolidayInput } from "@/lib/scheduler/generate";
import { getActiveShiftParts } from "@/lib/db/shiftParts";
import { and, eq, lt } from "drizzle-orm";

function buildWeekDates(startDate: string): string[] {
  const weekStart = parseLocalDate(startDate);
  return Array.from({ length: 7 }, (_, index) => {
    return formatLocalDate(addLocalDays(weekStart, index));
  });
}

function isValidWeekLabel(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-W\d{2}$/.test(value);
}

export async function POST(req: Request) {
  try {
    const { weekLabel, startDate, holidays = [] } = await req.json();

    if (!isValidWeekLabel(weekLabel)) {
      return apiError("주차 형식이 올바르지 않습니다.", 400, "INVALID_WEEK_LABEL");
    }

    if (!isValidDateString(startDate)) {
      return apiError("시작 날짜가 올바르지 않습니다.", 400, "INVALID_START_DATE");
    }

    const allEmployees = await db.select().from(employees).where(eq(employees.isActive, true));
    const existingSchedule = await db.select().from(schedules).where(eq(schedules.weekLabel, weekLabel));
    const pastLogs = await db
      .select()
      .from(shiftLogs)
      .where(and(eq(shiftLogs.isConfirmed, true), lt(shiftLogs.date, startDate)));

    const weekDates = buildWeekDates(startDate);
    const { holidays: koreaHolidays, loaded: holidaysLoaded } = await getKoreaHolidaysForDatesWithStatus(weekDates);
    const holidayInputs: HolidayInput[] = Array.isArray(holidays) && holidays.length > 0
      ? holidays
      : koreaHolidays;
    const shiftParts = await getActiveShiftParts();
    const weekStart = parseLocalDate(startDate);
    const daySchedules = generateWeekSchedule(weekStart, allEmployees, pastLogs, holidayInputs, shiftParts);
    const warning = existingSchedule[0]?.status === "confirmed" ? "SCHEDULE_CONFIRMED" : undefined;

    return NextResponse.json({
      weekLabel,
      days: daySchedules,
      holidays: holidayNameMap(koreaHolidays),
      holidaysLoaded,
      shiftParts,
      warning,
    });
  } catch (error) {
    return apiInternalError(error, "스케줄 생성에 실패했습니다.");
  }
}
