import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";
import { shiftParts } from "@/lib/db/schema";
import { addNineHours, isHalfHourTime, MAX_SHIFT_PARTS, sortShiftParts } from "@/lib/shift-parts";
import { getActiveShiftParts } from "@/lib/db/shiftParts";

type ShiftPartInput = {
  code?: unknown;
  label?: unknown;
  startTime?: unknown;
};

type NormalizedShiftPart = {
  code: string;
  label: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isActive: true;
};

function readCode(value: unknown, usedCodes: Set<string>, index: number): string {
  if (typeof value === "string" && /^[a-z0-9-]+$/.test(value) && !usedCodes.has(value)) {
    usedCodes.add(value);
    return value;
  }

  let code = `part-${index + 1}`;
  let suffix = index + 1;

  while (usedCodes.has(code)) {
    suffix++;
    code = `part-${suffix}`;
  }

  usedCodes.add(code);
  return code;
}

function normalizeShiftParts(inputs: ShiftPartInput[]): { values: NormalizedShiftPart[] } | { error: string } {
  if (inputs.length < 1) {
    return { error: "파트는 최소 1개 이상 필요합니다." };
  }

  if (inputs.length > MAX_SHIFT_PARTS) {
    return { error: `파트는 최대 ${MAX_SHIFT_PARTS}개까지 만들 수 있습니다.` };
  }

  const usedCodes = new Set<string>();
  const values: NormalizedShiftPart[] = [];

  for (const [index, input] of inputs.entries()) {
    const label = typeof input.label === "string" ? input.label.trim() : "";
    const startTime = typeof input.startTime === "string" ? input.startTime : "";

    if (!label) {
      return { error: "파트 이름을 입력하세요." };
    }

    if (!isHalfHourTime(startTime)) {
      return { error: "시작 시간은 30분 단위로 입력하세요." };
    }

    values.push({
      code: readCode(input.code, usedCodes, index),
      label,
      startTime,
      endTime: addNineHours(startTime),
      sortOrder: index,
      isActive: true,
    });
  }

  return { values };
}

export async function GET() {
  const rows = await getActiveShiftParts();
  return NextResponse.json(rows);
}

export async function PUT(req: Request) {
  await migrate();
  const body = await req.json();
  const inputs = Array.isArray(body.parts) ? body.parts : [];
  const normalized = normalizeShiftParts(inputs);

  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    await tx.delete(shiftParts);
    await tx.insert(shiftParts).values(normalized.values);
  });

  return NextResponse.json(sortShiftParts(normalized.values));
}
