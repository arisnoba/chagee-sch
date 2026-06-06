import { NextResponse } from "next/server";
import { apiError, apiInternalError } from "@/lib/api/response";
import { and, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { employees, schedules, shiftLogs } from "@/lib/db/schema";
import { getKoreaHolidaysForDates, holidayNameMap } from "@/lib/calendar/koreaHolidays";
import { getActiveShiftParts } from "@/lib/db/shiftParts";

function isValidMonth(month: string | null): month is string {
  return !!month && /^\d{4}-\d{2}$/.test(month);
}

function getMonthDates(month: string): string[] {
  const [year, monthIndex] = month.split("-").map(Number);
  const lastDay = new Date(year, monthIndex, 0).getDate();

  return Array.from({ length: lastDay }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${month}-${day}`;
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const month = url.searchParams.get("month");

    if (!isValidMonth(month)) {
      return apiError("월 형식이 올바르지 않습니다. YYYY-MM 형식을 사용하세요.", 400, "INVALID_MONTH");
    }

    const dates = getMonthDates(month);
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    const savedSchedules = await db
      .select()
      .from(schedules)
      .where(lte(schedules.startDate, endDate));
    const scheduleWeekLabels = savedSchedules.map((schedule) => schedule.weekLabel);
    const logs = scheduleWeekLabels.length > 0
      ? await db
        .select()
        .from(shiftLogs)
        .where(and(
          gte(shiftLogs.date, startDate),
          lte(shiftLogs.date, endDate),
          inArray(shiftLogs.weekLabel, scheduleWeekLabels)
        ))
      : [];
    const emps = await db.select().from(employees);
    const holidays = await getKoreaHolidaysForDates(dates);
    const shiftParts = await getActiveShiftParts();

    return NextResponse.json({
      month,
      dates,
      logs,
      schedules: savedSchedules,
      employees: emps,
      holidays: holidayNameMap(holidays),
      shiftParts,
    });
  } catch (error) {
    return apiInternalError(error, "월간 근무표를 불러오지 못했습니다.");
  }
}
