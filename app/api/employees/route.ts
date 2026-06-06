import { NextResponse } from "next/server";
import { apiError, apiInternalError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const ALL_DAYS = JSON.stringify(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const PREFERENCES = new Set(["like", "neutral", "dislike"]);

function readPreference(value: unknown): "like" | "neutral" | "dislike" {
  return typeof value === "string" && PREFERENCES.has(value)
    ? value as "like" | "neutral" | "dislike"
    : "neutral";
}

export async function GET() {
  try {
    const rows = await db.select().from(employees).where(eq(employees.isActive, true));
    return NextResponse.json(rows);
  } catch (error) {
    return apiInternalError(error, "직원 목록을 불러오지 못했습니다.");
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return apiError("직원 이름을 입력하세요.", 400, "INVALID_EMPLOYEE_NAME");
    }

    const inserted = await db
      .insert(employees)
      .values({
        name,
        employmentType: "fulltime",
        availableDays: ALL_DAYS,
        openPreference: readPreference(body.openPreference),
        middlePreference: readPreference(body.middlePreference),
        closePreference: readPreference(body.closePreference),
        isActive: true,
      })
      .returning();

    return NextResponse.json(inserted[0], { status: 201 });
  } catch (error) {
    return apiInternalError(error, "직원을 추가하지 못했습니다.");
  }
}
