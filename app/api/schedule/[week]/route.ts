import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { employees, shiftLogs, schedules } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const schedule = await db.select().from(schedules).where(eq(schedules.weekLabel, week));
  if (!schedule.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const logs = await db.select().from(shiftLogs).where(eq(shiftLogs.weekLabel, week));
  const emps = await db.select().from(employees);
  return NextResponse.json({ schedule: schedule[0], logs, employees: emps });
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
