import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { employees, shiftLogs, schedules } from "@/lib/db/schema";
import { getKoreaHolidaysForDates, holidayNameMap } from "@/lib/calendar/koreaHolidays";
import { getActiveShiftParts } from "@/lib/db/shiftParts";
import { eq, and, inArray, or } from "drizzle-orm";
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

function validateSchedulePayload(
  days: DaySchedule[],
  activeEmployeeIds: Set<number>,
  shiftCodes: Set<string>
): string | null {
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
      return "Invalid schedule date";
    }

    const assignedEmployeeIds = new Set<number>();

    for (const slot of day.slots) {
      if (!slot || typeof slot !== "object") {
        return "Invalid shift entry in schedule";
      }

      if (!Number.isInteger(slot.employeeId) || !activeEmployeeIds.has(slot.employeeId)) {
        return "Invalid employee in schedule";
      }

      if (typeof slot.shiftType !== "string" || !shiftCodes.has(slot.shiftType)) {
        return "Invalid shift type in schedule";
      }

      if (assignedEmployeeIds.has(slot.employeeId)) {
        return "Employee is assigned multiple times in one day";
      }
      assignedEmployeeIds.add(slot.employeeId);
    }

    for (const off of day.offEmployees) {
      if (!off || typeof off !== "object") {
        return "Invalid off entry in schedule";
      }

      if (!Number.isInteger(off.employeeId) || !activeEmployeeIds.has(off.employeeId)) {
        return "Invalid employee in schedule";
      }

      if (assignedEmployeeIds.has(off.employeeId)) {
        return "Employee is assigned multiple times in one day";
      }
      assignedEmployeeIds.add(off.employeeId);
    }
  }

  return null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const schedule = await db.select().from(schedules).where(eq(schedules.weekLabel, week));
  if (!schedule.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const logs = await db.select().from(shiftLogs).where(eq(shiftLogs.weekLabel, week));
  const logEmployeeIds = [...new Set(logs.map((log) => log.employeeId))];
  const emps = logEmployeeIds.length > 0
    ? await db
      .select()
      .from(employees)
      .where(or(eq(employees.isActive, true), inArray(employees.id, logEmployeeIds)))
    : await db.select().from(employees).where(eq(employees.isActive, true));
  const holidays = await getKoreaHolidaysForDates([...new Set(logs.map((log) => log.date))]);
  const shiftParts = await getActiveShiftParts();
  return NextResponse.json({ schedule: schedule[0], logs, employees: emps, holidays: holidayNameMap(holidays), shiftParts });
}

export async function PATCH(_req: Request, { params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const schedule = await db.select().from(schedules).where(eq(schedules.weekLabel, week));

  if (!schedule.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx.update(schedules)
      .set({ status: "confirmed", confirmedAt: new Date().toISOString() })
      .where(eq(schedules.weekLabel, week));
    await tx.update(shiftLogs)
      .set({ isConfirmed: true })
      .where(and(eq(shiftLogs.weekLabel, week), eq(shiftLogs.isConfirmed, false)));
  });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request, { params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const { days, replaceConfirmed = false } = await req.json();
  const schedule = await db.select().from(schedules).where(eq(schedules.weekLabel, week));

  if (!Array.isArray(days) || !days.every(isValidDaySchedule)) {
    return NextResponse.json({ error: "Invalid schedule days" }, { status: 400 });
  }

  if (days.length === 0) {
    return NextResponse.json({ error: "Schedule days cannot be empty" }, { status: 400 });
  }

  const activeEmployees = await db.select({ id: employees.id }).from(employees).where(eq(employees.isActive, true));
  const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id));
  const shiftParts = await getActiveShiftParts();
  const shiftCodes = new Set(shiftParts.map((part) => part.code));
  const validationError = validateSchedulePayload(days, activeEmployeeIds, shiftCodes);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  if (schedule[0]?.status === "confirmed" && replaceConfirmed !== true) {
    return NextResponse.json(
      { error: "이미 확정된 근무표입니다.", code: "SCHEDULE_CONFIRMED" },
      { status: 409 }
    );
  }

  const startDate = [...days].map((day: DaySchedule) => day.date).sort()[0];

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

  await db.transaction(async (tx) => {
    if (!schedule.length) {
      await tx.insert(schedules).values({ weekLabel: week, startDate, status: "draft" });
    } else if (schedule[0].status === "confirmed") {
      await tx.update(schedules)
        .set({ startDate, status: "draft", confirmedAt: null })
        .where(eq(schedules.weekLabel, week));
    }

    await tx.delete(shiftLogs).where(eq(shiftLogs.weekLabel, week));
    if (logsToInsert.length > 0) await tx.insert(shiftLogs).values(logsToInsert);
  });

  return NextResponse.json({ ok: true });
}
