import { NextResponse } from "next/server";
import { apiError, apiInternalError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { employees } from "@/lib/db/schema";
import {
  readPreference,
  sanitizePartPreferences,
  serializePartPreferences,
} from "@/lib/employee-preferences";
import { eq } from "drizzle-orm";

const ALL_DAYS = JSON.stringify(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

export async function GET() {
  try {
    await migrate();
    const rows = await db.select().from(employees).where(eq(employees.isActive, true));
    return NextResponse.json(rows);
  } catch (error) {
    return apiInternalError(error, "직원 목록을 불러오지 못했습니다.");
  }
}

export async function POST(req: Request) {
  try {
    await migrate();
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return apiError("직원 이름을 입력하세요.", 400, "INVALID_EMPLOYEE_NAME");
    }

    const partPreferences = sanitizePartPreferences(body.partPreferences, {
      open: readPreference(body.openPreference),
      middle: readPreference(body.middlePreference),
      close: readPreference(body.closePreference),
    });

    const inserted = await db
      .insert(employees)
      .values({
        name,
        employmentType: "fulltime",
        availableDays: ALL_DAYS,
        openPreference: readPreference(partPreferences.open),
        middlePreference: readPreference(partPreferences.middle),
        closePreference: readPreference(partPreferences.close),
        partPreferences: serializePartPreferences(partPreferences),
        isActive: true,
      })
      .returning();

    return NextResponse.json(inserted[0], { status: 201 });
  } catch (error) {
    return apiInternalError(error, "직원을 추가하지 못했습니다.");
  }
}
