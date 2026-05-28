import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const rows = await db.select().from(employees).where(eq(employees.isActive, true));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const inserted = await db.insert(employees).values(body).returning();
  return NextResponse.json(inserted[0], { status: 201 });
}
