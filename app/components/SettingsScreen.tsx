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

      <div className="rounded-[20px] border border-line bg-card p-[18px] shadow-soft">
        <p className="text-sm leading-[1.6] text-sub">
          💡 사용법: 동생이 파란 버튼을 누르고 우편물·안내문을 찍으면, 내용을
          쉬운 말로 읽어줍니다. 중요한 문서면 &quot;형한테 보내기&quot; 버튼이
          나타납니다.
        </p>
      </div>

      <button
        onClick={onClose}
        className="rounded-[18px] bg-ink px-[18px] py-[18px] text-[19px] font-extrabold text-white"
      >
        저장하고 닫기
      </button>
    </section>
  );
}
