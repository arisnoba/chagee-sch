import { NextResponse } from "next/server";
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
  const rows = await db.select().from(employees).where(eq(employees.isActive, true));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "직원 이름을 입력하세요." }, { status: 400 });
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
}
