import { NextResponse } from "next/server";
import { getGuardian } from "@/lib/guardian/adapters";

export async function GET() {
  const guardian = getGuardian();
  if (!guardian) return NextResponse.json({ enabled: false, phone: null });
  const phone = await guardian.store.getGuardianPhone();
  return NextResponse.json({ enabled: true, phone });
}

export async function POST(request: Request) {
  const guardian = getGuardian();
  if (!guardian) {
    return NextResponse.json({ error: "guardian disabled" }, { status: 503 });
  }
  const { phone } = (await request.json()) as { phone?: string };
  const cleaned = (phone ?? "").replace(/[^0-9]/g, "");
  if (!/^01[016789][0-9]{7,8}$/.test(cleaned)) {
    return NextResponse.json({ error: "invalid phone" }, { status: 400 });
  }
  await guardian.store.setGuardianPhone(cleaned);
  return NextResponse.json({ ok: true });
}
