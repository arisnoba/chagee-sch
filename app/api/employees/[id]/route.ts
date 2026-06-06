import { NextResponse } from "next/server";
import { apiError, apiInternalError } from "@/lib/api/response";
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
  try {
    const { id } = await params;
    const employeeId = parseEmployeeId(id);

    if (!employeeId) {
      return apiError("직원 id가 올바르지 않습니다.", 400, "INVALID_EMPLOYEE_ID");
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
        return apiError("직원 이름을 입력하세요.", 400, "INVALID_EMPLOYEE_NAME");
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
      return apiError("변경할 내용을 입력하세요.", 400, "NO_CHANGES");
    }

    const updated = await db
      .update(employees)
      .set(updates)
      .where(eq(employees.id, employeeId))
      .returning();

    if (!updated[0]) return apiError("직원을 찾을 수 없습니다.", 404, "EMPLOYEE_NOT_FOUND");
    return NextResponse.json(updated[0]);
  } catch (error) {
    return apiInternalError(error, "직원을 수정하지 못했습니다.");
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const employeeId = parseEmployeeId(id);

    if (!employeeId) {
      return apiError("직원 id가 올바르지 않습니다.", 400, "INVALID_EMPLOYEE_ID");
    }

    const updated = await db
      .update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, employeeId))
      .returning();

    if (!updated[0]) return apiError("직원을 찾을 수 없습니다.", 404, "EMPLOYEE_NOT_FOUND");
    return NextResponse.json(updated[0]);
  } catch (error) {
    return apiInternalError(error, "직원을 삭제하지 못했습니다.");
  }
}
