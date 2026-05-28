import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { employees, shiftLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { rankByFairness } from "@/lib/scheduler/fairness";

export async function GET() {
  const emps = await db.select().from(employees).where(eq(employees.isActive, true));
  const logs = await db.select().from(shiftLogs).where(eq(shiftLogs.isConfirmed, true));
  const ranked = rankByFairness(emps, logs);
  return NextResponse.json(ranked);
}
