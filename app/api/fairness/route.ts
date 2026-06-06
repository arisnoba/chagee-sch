import { NextResponse } from "next/server";
import { apiInternalError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { employees, shiftLogs } from "@/lib/db/schema";
import { getActiveShiftParts } from "@/lib/db/shiftParts";
import { and, eq, gte, lte } from "drizzle-orm";
import { rankByFairness } from "@/lib/scheduler/fairness";
import { formatLocalDate } from "@/lib/calendar/date";
import { getFairnessHistoryStartDate } from "@/lib/scheduler/history";

export async function GET() {
  try {
    await migrate();
    const today = formatLocalDate(new Date());
    const historyStartDate = getFairnessHistoryStartDate(today);
    const emps = await db.select().from(employees).where(eq(employees.isActive, true));
    const logs = await db
      .select()
      .from(shiftLogs)
      .where(and(
        eq(shiftLogs.isConfirmed, true),
        gte(shiftLogs.date, historyStartDate),
        lte(shiftLogs.date, today)
      ));
    const shiftParts = await getActiveShiftParts();
    const ranked = rankByFairness(emps, logs, { shiftParts });
    return NextResponse.json(ranked);
  } catch (error) {
    return apiInternalError(error, "공평 지표를 불러오지 못했습니다.");
  }
}
