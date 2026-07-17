let koVoice: SpeechSynthesisVoice | null = null;

function pickVoice() {
  const vs = window.speechSynthesis.getVoices();
  koVoice =
    vs.find((v) => v.lang === "ko-KR") ||
    vs.find((v) => v.lang && v.lang.startsWith("ko")) ||
    null;
}

export function initTTS() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
}

interface SpeakOptions {
  rate?: number;
  onSpeakingChange?: (speaking: boolean) => void;
  onLabelChange?: (label: string) => void;
  onEnd?: () => void;
}

export function speak(text: string, opts: SpeakOptions = {}) {
  const { rate = 1, onSpeakingChange, onLabelChange, onEnd } = opts;
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const parts = text.split(/(?<=[.!?。])\s+|\n+/).filter(Boolean);
  let i = 0;

  const next = () => {
    if (i >= parts.length) {
      onSpeakingChange?.(false);
      onLabelChange?.("다 읽었어요");
      onEnd?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(parts[i++]);
    u.lang = "ko-KR";
    if (koVoice) u.voice = koVoice;
    u.rate = rate;
    u.pitch = 1;
    u.onend = next;
    u.onerror = next;
    window.speechSynthesis.speak(u);
  };

  onSpeakingChange?.(true);
  onLabelChange?.("말하는 중…");
  next();
}

export function cancelSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/** iOS unlocks speechSynthesis only after a user gesture triggers an utterance. */
export function unlockTTS() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore — best-effort unlock
  }
}
