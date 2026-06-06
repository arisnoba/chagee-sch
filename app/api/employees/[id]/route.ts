import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const PREFERENCES = new Set(["like", "neutral", "dislike"]);

function parseEmployeeId(id: string): number | null {
  const employeeId = Number.parseInt(id, 10);
  return Number.isNaN(employeeId) ? null : employeeId;
}

function readPreference(value: unknown): "like" | "neutral" | "dislike" | undefined {
  if (typeof value !== "string" || !PREFERENCES.has(value)) return undefined;
  return value as "like" | "neutral" | "dislike";
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employeeId = parseEmployeeId(id);

  if (!employeeId) {
    return NextResponse.json({ error: "Invalid employee id" }, { status: 400 });
  }

  const body = await req.json();
  const updates: {
    name?: string;
    openPreference?: "like" | "neutral" | "dislike";
    middlePreference?: "like" | "neutral" | "dislike";
    closePreference?: "like" | "neutral" | "dislike";
  } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();

    if (!name) {
      return NextResponse.json({ error: "직원 이름을 입력하세요." }, { status: 400 });
    }

    updates.name = name;
  }

  const openPreference = readPreference(body.openPreference);
  const middlePreference = readPreference(body.middlePreference);
  const closePreference = readPreference(body.closePreference);

  if (openPreference) updates.openPreference = openPreference;
  if (middlePreference) updates.middlePreference = middlePreference;
  if (closePreference) updates.closePreference = closePreference;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const updated = await db
    .update(employees)
    .set(updates)
    .where(eq(employees.id, employeeId))
    .returning();

  if (!updated[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated[0]);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employeeId = parseEmployeeId(id);

  if (!employeeId) {
    return NextResponse.json({ error: "Invalid employee id" }, { status: 400 });
  }

  const updated = await db
    .update(employees)
    .set({ isActive: false })
    .where(eq(employees.id, employeeId))
    .returning();

  if (!updated[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated[0]);
}
