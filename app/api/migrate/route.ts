import { NextResponse } from "next/server";
import { apiInternalError } from "@/lib/api/response";
import { requireMaintenanceAccess } from "@/lib/api/maintenance";
import { migrate } from "@/lib/db/migrate";

export async function POST(req: Request) {
  const forbidden = requireMaintenanceAccess(req);
  if (forbidden) return forbidden;

  try {
    await migrate();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiInternalError(error, "마이그레이션에 실패했습니다.");
  }
}
