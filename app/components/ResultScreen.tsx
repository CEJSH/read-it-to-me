import type { AnalyzeResult } from "@/lib/types";

interface ResultScreenProps {
  result: AnalyzeResult;
  speaking: boolean;
  speakLabel: string;
  onCardTap: (text: string) => void;
  onReplay: () => void;
  onAgain: () => void;
  onShare: () => void;
}

interface CardSpec {
  icon: string;
  title: string;
  text: string;
  todo?: boolean;
}

export function ResultScreen({
  result,
  speaking,
  speakLabel,
  onCardTap,
  onReplay,
  onAgain,
  onShare,
}: ResultScreenProps) {
  const cards: CardSpec[] = [
    { icon: "✉️", title: "누가 보냈어요", text: result.sender ?? "" },
    { icon: "💬", title: "무슨 내용이에요", text: result.message ?? "" },
    { icon: "✅", title: "할 일", text: result.action ?? "", todo: true },
  ];

  return (
    <section className="flex flex-1 flex-col gap-3.5">
      <div className="flex items-center gap-3 rounded-[20px] border border-line bg-card px-[18px] py-3.5 text-lg font-bold text-sub shadow-soft">
        <span
          className={`h-3 w-3 rounded-full bg-green ${speaking ? "animate-blink" : ""}`}
        />
        <span>{speakLabel}</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-auto">
        {cards.map((c) => (
          <button
            key={c.title}
            onClick={() => onCardTap(c.text)}
            className={`flex w-full items-start gap-4 rounded-app border px-5 py-[18px] text-left shadow-soft transition active:scale-[0.99] active:bg-[#F1EEE6] ${
              c.todo ? "border-amber/60 bg-[#FFF7EE]" : "border-line bg-card"
            }`}
          >
            <span className="text-[34px] leading-none">{c.icon}</span>
            <span className="flex flex-col">
              <span className="mb-1 text-[15px] font-extrabold text-sub">
                {c.title}
              </span>
              <span className="text-xl font-bold leading-[1.45]">
                {c.text}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onReplay}
          className="flex flex-col items-center gap-2 rounded-3xl bg-green px-2.5 py-[22px] text-xl font-extrabold text-white shadow-[0_12px_26px_-10px_rgba(14,138,95,0.6)] transition active:scale-[0.98]"
        >
          <span className="text-4xl">🔊</span>
          다시 듣기
        </button>
        <button
          onClick={onAgain}
          className="flex flex-col items-center gap-2 rounded-3xl bg-blue px-2.5 py-[22px] text-xl font-extrabold text-white shadow-[0_12px_26px_-10px_rgba(36,86,230,0.6)] transition active:scale-[0.98]"
        >
          <span className="text-4xl">📷</span>
          새로 찍기
        </button>
        {result.important && (
          <button
            onClick={onShare}
            className="col-span-2 flex flex-col items-center gap-2 rounded-3xl bg-violet px-2.5 py-[22px] text-xl font-extrabold text-white shadow-[0_12px_26px_-10px_rgba(109,84,201,0.6)] transition active:scale-[0.98]"
          >
            <span className="text-4xl">👨‍👦</span>
            형한테 보내기
          </button>
        )}
      </div>
    </section>
  );
}
