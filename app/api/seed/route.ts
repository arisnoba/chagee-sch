import { NextResponse } from "next/server";
import { apiInternalError } from "@/lib/api/response";
import { requireMaintenanceAccess } from "@/lib/api/maintenance";
import { seed } from "@/lib/db/seed";

export async function POST(req: Request) {
  const forbidden = requireMaintenanceAccess(req);
  if (forbidden) return forbidden;

  try {
    await seed();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiInternalError(error, "목업 데이터 초기화에 실패했습니다.");
  }
}
