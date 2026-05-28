import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { employees, shiftLogs, schedules } from "@/lib/db/schema";
import { getKoreaHolidaysForDates, holidayNameMap } from "@/lib/calendar/koreaHolidays";
import { generateWeekSchedule, type HolidayInput } from "@/lib/scheduler/generate";
import { eq } from "drizzle-orm";

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
  const pastLogs = await db.select().from(shiftLogs).where(eq(shiftLogs.isConfirmed, true));

  const weekDates = buildWeekDates(startDate);
  const koreaHolidays = await getKoreaHolidaysForDates(weekDates);
  const holidayInputs: HolidayInput[] = Array.isArray(holidays) && holidays.length > 0
    ? holidays
    : koreaHolidays;
  const weekStart = new Date(startDate);
  const daySchedules = generateWeekSchedule(weekStart, allEmployees, pastLogs, holidayInputs);

  // 기존 드래프트 삭제 후 새로 저장
  await db.delete(shiftLogs).where(eq(shiftLogs.weekLabel, weekLabel));
  await db.delete(schedules).where(eq(schedules.weekLabel, weekLabel));

  await db.insert(schedules).values({ weekLabel, startDate, status: "draft" });

  const logsToInsert = daySchedules.flatMap((day) => {
    const shiftEntries = day.slots.map((slot) => ({
      employeeId: slot.employeeId,
      date: day.date,
      shiftType: slot.shiftType,
      dayType: day.dayType,
      weekLabel,
      isConfirmed: false,
    }));
    const offEntries = day.offEmployees.map((off) => ({
      employeeId: off.employeeId,
      date: day.date,
      shiftType: "off" as const,
      dayType: day.dayType,
      weekLabel,
      isConfirmed: false,
    }));
    return [...shiftEntries, ...offEntries];
  });

  await db.insert(shiftLogs).values(logsToInsert);

  return NextResponse.json({ weekLabel, days: daySchedules, holidays: holidayNameMap(koreaHolidays) });
}
