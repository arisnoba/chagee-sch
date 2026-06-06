import { NextResponse } from "next/server";
import { apiError, apiInternalError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { employees } from "@/lib/db/schema";
import {
  getEmployeePartPreferences,
  isPreference,
  readPreference,
  sanitizePartPreferences,
  serializePartPreferences,
  type Preference,
} from "@/lib/employee-preferences";
import { eq } from "drizzle-orm";

function parseEmployeeId(id: string): number | null {
  const employeeId = Number.parseInt(id, 10);
  return Number.isNaN(employeeId) ? null : employeeId;
}

function readOptionalPreference(value: unknown): Preference | undefined {
  return isPreference(value) ? value : undefined;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await migrate();
    const { id } = await params;
    const employeeId = parseEmployeeId(id);

    if (!employeeId) {
      return apiError("직원 id가 올바르지 않습니다.", 400, "INVALID_EMPLOYEE_ID");
    }

    const body = await req.json();
    const updates: {
      name?: string;
      openPreference?: Preference;
      middlePreference?: Preference;
      closePreference?: Preference;
      partPreferences?: string;
    } = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();

      if (!name) {
        return apiError("직원 이름을 입력하세요.", 400, "INVALID_EMPLOYEE_NAME");
      }

      updates.name = name;
    }

    const openPreference = readOptionalPreference(body.openPreference);
    const middlePreference = readOptionalPreference(body.middlePreference);
    const closePreference = readOptionalPreference(body.closePreference);
    const hasPreferenceChanges =
      body.partPreferences !== undefined ||
      openPreference !== undefined ||
      middlePreference !== undefined ||
      closePreference !== undefined;

    if (hasPreferenceChanges) {
      const current = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);

      if (!current[0]) return apiError("직원을 찾을 수 없습니다.", 404, "EMPLOYEE_NOT_FOUND");

      const partPreferences = sanitizePartPreferences(
        body.partPreferences,
        getEmployeePartPreferences(current[0])
      );

      if (openPreference) partPreferences.open = openPreference;
      if (middlePreference) partPreferences.middle = middlePreference;
      if (closePreference) partPreferences.close = closePreference;

      updates.openPreference = readPreference(partPreferences.open);
      updates.middlePreference = readPreference(partPreferences.middle);
      updates.closePreference = readPreference(partPreferences.close);
      updates.partPreferences = serializePartPreferences(partPreferences);
    }

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
    await migrate();
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
