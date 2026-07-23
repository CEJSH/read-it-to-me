import { NextResponse } from "next/server";
import { getGuardian } from "@/lib/guardian/adapters";

export async function POST(request: Request) {
  const guardian = getGuardian();
  if (!guardian) {
    return NextResponse.json({ error: "guardian disabled" }, { status: 503 });
  }
  const { token, mode } = (await request.json()) as {
    token?: string;
    mode?: "ignore" | "always" | "none";
  };
  if (!token || !mode || !["ignore", "always", "none"].includes(mode)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const scan = await guardian.store.getScanByToken(token);
  if (!scan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const next = mode === "none" ? null : mode;
  await guardian.store.setRule(scan.senderKey, next);
  return NextResponse.json({ ok: true, mode: next });
}
