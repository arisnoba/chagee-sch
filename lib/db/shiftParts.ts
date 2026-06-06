import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { shiftParts } from "@/lib/db/schema";
import { DEFAULT_SHIFT_PARTS, sortShiftParts, type WorkShiftPart } from "@/lib/shift-parts";

export async function getActiveShiftParts(): Promise<WorkShiftPart[]> {
  await migrate();
  const rows = await db.select().from(shiftParts).where(eq(shiftParts.isActive, true));

  if (rows.length > 0) {
    return sortShiftParts(rows);
  }

  await db.insert(shiftParts).values(DEFAULT_SHIFT_PARTS);
  return DEFAULT_SHIFT_PARTS.map(({ code, label, startTime, endTime, sortOrder }) => ({
    code,
    label,
    startTime,
    endTime,
    sortOrder,
  }));
}
