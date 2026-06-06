import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";

export function requireMaintenanceAccess(req: Request): NextResponse | null {
  if (process.env.NODE_ENV === "development") return null;

  const secret = process.env.MAINTENANCE_SECRET;
  const providedSecret = req.headers.get("x-maintenance-secret");

  if (secret && providedSecret === secret) return null;

  return apiError("권한이 없습니다.", 403, "FORBIDDEN");
}
