import { NextResponse } from "next/server";

export function requireMaintenanceAccess(req: Request): NextResponse | null {
  if (process.env.NODE_ENV === "development") return null;

  const secret = process.env.MAINTENANCE_SECRET;
  const providedSecret = req.headers.get("x-maintenance-secret");

  if (secret && providedSecret === secret) return null;

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
