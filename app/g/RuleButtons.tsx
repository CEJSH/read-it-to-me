"use client";

import { useState } from "react";
import type { RuleMode } from "@/lib/guardian/types";

export function RuleButtons({
  token,
  senderKey,
  initialMode,
}: {
  token: string;
  senderKey: string;
  initialMode: RuleMode | null;
}) {
  const [mode, setMode] = useState<RuleMode | null>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function apply(next: RuleMode | null) {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/guardian/rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, mode: next ?? "none" }),
      });
      if (res.ok) setMode(next);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function btn(target: RuleMode, label: string) {
    const active = mode === target;
    return (
      <button
        disabled={busy}
        aria-pressed={active}
        onClick={() => apply(active ? null : target)}
        className={`flex-1 rounded-[14px] border-2 px-3.5 py-3 text-[15px] font-bold ${
          active ? "border-blue bg-blue text-white" : "border-line bg-white"
        }`}
      >
        {active ? `${label} ✓ (해제)` : label}
      </button>
    );
  }

  return (
    <div className="rounded-[20px] border border-line bg-card p-[18px] shadow-soft">
      <p className="mb-2.5 text-[15px] font-bold text-sub">
        &lsquo;{senderKey}&rsquo; 발신자 규칙
      </p>
      <div className="flex gap-2">
        {btn("ignore", "이 발신자는 무시")}
        {btn("always", "항상 알림")}
      </div>
      {error && (
        <p className="mt-2 text-sm font-bold text-[#C0392B]">
          저장하지 못했어요. 한 번 더 눌러 주세요.
        </p>
      )}
    </div>
  );
}
