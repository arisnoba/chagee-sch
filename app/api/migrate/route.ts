import { NextResponse } from "next/server";
import { requireMaintenanceAccess } from "@/lib/api/maintenance";
import { migrate } from "@/lib/db/migrate";

export async function POST(req: Request) {
  const forbidden = requireMaintenanceAccess(req);
  if (forbidden) return forbidden;

  try {
    await migrate();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}
