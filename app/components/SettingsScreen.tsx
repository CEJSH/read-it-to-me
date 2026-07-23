"use client";

import { useEffect, useState } from "react";
import type { ExplanationLevel, Settings, SpeechRate } from "@/lib/types";

interface SettingsScreenProps {
  settings: Settings;
  onRateChange: (rate: SpeechRate) => void;
  onLevelChange: (level: ExplanationLevel) => void;
  onClose: () => void;
}

const RATE_OPTIONS: { value: SpeechRate; label: string }[] = [
  { value: 0.7, label: "아주 느리게" },
  { value: 0.85, label: "느리게" },
  { value: 1, label: "보통" },
];

const LEVEL_OPTIONS: { value: ExplanationLevel; label: string }[] = [
  { value: "simple", label: "아주 쉽게" },
  { value: "normal", label: "조금 자세히" },
];

function segButtonClass(selected: boolean) {
  return `flex-1 rounded-[14px] border-2 px-3.5 py-3.5 text-[17px] font-bold ${
    selected ? "border-blue bg-blue text-white" : "border-line bg-white"
  }`;
}

export function SettingsScreen({
  settings,
  onRateChange,
  onLevelChange,
  onClose,
}: SettingsScreenProps) {
  const [phone, setPhone] = useState("");
  const [phoneEnabled, setPhoneEnabled] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [phoneError, setPhoneError] = useState(false);

  useEffect(() => {
    fetch("/api/guardian/phone")
      .then((r) => r.json())
      .then((d: { enabled: boolean; hasPhone: boolean }) => {
        setPhoneEnabled(d.enabled);
        setHasPhone(d.hasPhone);
      })
      .catch(() => setPhoneEnabled(false));
  }, []);

  async function savePhone(): Promise<boolean> {
    if (!phoneEnabled || !phone) return true;
    const cleaned = phone.replace(/[^0-9]/g, "");
    if (!/^01[016789][0-9]{7,8}$/.test(cleaned)) {
      setPhoneError(true);
      return false;
    }
    try {
      const res = await fetch("/api/guardian/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        setPhoneError(true);
        return false;
      }
      setPhoneSaved(true);
      setHasPhone(true);
      setPhoneError(false);
      return true;
    } catch {
      setPhoneError(true);
      return false;
    }
  }

  return (
    <section className="flex flex-1 flex-col gap-[18px]">
      <h2 className="mx-1 my-1.5 text-[22px]">보호자 설정</h2>

      <div className="rounded-[20px] border border-line bg-card p-[18px] shadow-soft">
        <label className="mb-2.5 block text-[17px] font-bold">
          말하는 속도
        </label>
        <div className="flex gap-2">
          {RATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onRateChange(opt.value)}
              className={segButtonClass(settings.rate === opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[20px] border border-line bg-card p-[18px] shadow-soft">
        <label className="mb-2.5 block text-[17px] font-bold">
          설명 수준
        </label>
        <div className="flex gap-2">
          {LEVEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onLevelChange(opt.value)}
              className={segButtonClass(settings.level === opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm leading-[1.6] text-sub">
          &quot;아주 쉽게&quot;는 한 문장을 짧게 끊어서, 어려운 낱말 없이
          설명합니다.
        </p>
      </div>

      {phoneEnabled && (
        <div className="rounded-[20px] border border-line bg-card p-[18px] shadow-soft">
          <label className="mb-2.5 block text-[17px] font-bold">
            형(보호자) 전화번호
          </label>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneSaved(false);
              setPhoneError(false);
            }}
            placeholder="01012345678"
            className="w-full rounded-[14px] border-2 border-line bg-white px-3.5 py-3.5 text-[17px] font-bold"
          />
          <p className="mt-2 text-sm leading-[1.6] text-sub">
            중요한 문서가 오면 이 번호로 문자를 보내요.
            {hasPhone &&
              !phone &&
              " 번호가 이미 등록되어 있어요. 바꾸려면 새 번호를 입력하세요."}
            {phoneSaved && " ✓ 저장했어요."}
          </p>
          {phoneError && (
            <p className="mt-2 text-sm font-bold text-[#C0392B]">
              전화번호를 저장하지 못했어요. 숫자만 다시 확인해 주세요.
            </p>
          )}
        </div>
      )}

      <div className="rounded-[20px] border border-line bg-card p-[18px] shadow-soft">
        <p className="text-sm leading-[1.6] text-sub">
          💡 사용법: 동생이 파란 버튼을 누르고 우편물·안내문을 찍으면, 내용을
          쉬운 말로 읽어줍니다. 중요한 문서면 &quot;형한테 보내기&quot; 버튼이
          나타납니다.
        </p>
      </div>

      <button
        onClick={async () => {
          const ok = await savePhone();
          if (ok) onClose();
        }}
        className="rounded-[18px] bg-ink px-[18px] py-[18px] text-[19px] font-extrabold text-white"
      >
        저장하고 닫기
      </button>
    </section>
  );
}
