import { NextResponse } from "next/server";
import { seed } from "@/lib/db/seed";

export async function POST() {
  try {
    await seed();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
