import { NextResponse } from "next/server";
import { migrate } from "@/lib/db/migrate";

export async function POST() {
  try {
    await migrate();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
