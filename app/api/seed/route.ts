import { NextResponse } from "next/server";
import { requireMaintenanceAccess } from "@/lib/api/maintenance";
import { seed } from "@/lib/db/seed";

export async function POST(req: Request) {
  const forbidden = requireMaintenanceAccess(req);
  if (forbidden) return forbidden;

  try {
    await seed();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}
