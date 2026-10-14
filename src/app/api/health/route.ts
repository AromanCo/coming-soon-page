import { NextResponse } from "next/server";
import {
  isWaitlistConfigured,
  isWaitlistDatabaseReady,
} from "@/lib/waitlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!isWaitlistConfigured()) {
    return NextResponse.json(
      { status: "unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    const ready = await isWaitlistDatabaseReady();

    return NextResponse.json(
      { status: ready ? "ok" : "migrations-required" },
      {
        status: ready ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      { status: "database-unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
