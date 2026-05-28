import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const allowed = {
    openPreference: body.openPreference,
    middlePreference: body.middlePreference,
    closePreference: body.closePreference,
  };

  const updated = await db
    .update(employees)
    .set(allowed)
    .where(eq(employees.id, parseInt(id)))
    .returning();

  if (!updated[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated[0]);
}
