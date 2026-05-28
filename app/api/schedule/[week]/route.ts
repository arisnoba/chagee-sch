import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { employees, shiftLogs, schedules } from "@/lib/db/schema";
import { getKoreaHolidaysForDates, holidayNameMap } from "@/lib/calendar/koreaHolidays";
import { eq, and } from "drizzle-orm";
import type { DaySchedule } from "@/lib/scheduler/generate";

const MAX_OFF_PER_DAY = 4;

function isValidDaySchedule(day: unknown): day is DaySchedule {
  if (!day || typeof day !== "object") return false;
  const value = day as DaySchedule;
  return (
    typeof value.date === "string" &&
    ["weekday", "weekend", "holiday"].includes(value.dayType) &&
    Array.isArray(value.slots) &&
    Array.isArray(value.offEmployees) &&
    value.offEmployees.length <= MAX_OFF_PER_DAY
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const schedule = await db.select().from(schedules).where(eq(schedules.weekLabel, week));
  if (!schedule.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const logs = await db.select().from(shiftLogs).where(eq(shiftLogs.weekLabel, week));
  const emps = await db.select().from(employees);
  const holidays = await getKoreaHolidaysForDates([...new Set(logs.map((log) => log.date))]);
  return NextResponse.json({ schedule: schedule[0], logs, employees: emps, holidays: holidayNameMap(holidays) });
}

export async function PATCH(_req: Request, { params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  await db.update(schedules)
    .set({ status: "confirmed", confirmedAt: new Date().toISOString() })
    .where(eq(schedules.weekLabel, week));
  await db.update(shiftLogs)
    .set({ isConfirmed: true })
    .where(and(eq(shiftLogs.weekLabel, week), eq(shiftLogs.isConfirmed, false)));
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request, { params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const { days } = await req.json();
  const schedule = await db.select().from(schedules).where(eq(schedules.weekLabel, week));

  if (!schedule.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (schedule[0].status === "confirmed") {
    return NextResponse.json({ error: "Confirmed schedule cannot be edited" }, { status: 409 });
  }
  if (!Array.isArray(days) || !days.every(isValidDaySchedule)) {
    return NextResponse.json({ error: "Invalid schedule days" }, { status: 400 });
  }

  const logsToInsert = days.flatMap((day: DaySchedule) => {
    const shiftEntries = day.slots.map((slot) => ({
      employeeId: slot.employeeId,
      date: day.date,
      shiftType: slot.shiftType,
      dayType: day.dayType,
      weekLabel: week,
      isConfirmed: false,
    }));
    const offEntries = day.offEmployees.map((off) => ({
      employeeId: off.employeeId,
      date: day.date,
      shiftType: "off" as const,
      dayType: day.dayType,
      weekLabel: week,
      isConfirmed: false,
    }));
    return [...shiftEntries, ...offEntries];
  });

  await db.delete(shiftLogs).where(eq(shiftLogs.weekLabel, week));
  if (logsToInsert.length > 0) await db.insert(shiftLogs).values(logsToInsert);

  return NextResponse.json({ ok: true });
}
