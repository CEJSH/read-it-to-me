// Speech playback. Primary path fetches natural neural audio from /api/tts and
// plays it through a single shared <audio> element. If that fails (no API key,
// network error, autoplay block), it falls back to the browser's built-in
// Web Speech voice so the app never goes silent.

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

// One reused element: iOS only "unlocks" the exact element that was played
// during a user gesture, so we must play every clip through the same one.
let audioEl: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let currentAbort: AbortController | null = null;
// Bumped on every new speak()/cancel() so stale fetch/audio callbacks bail out.
let playToken = 0;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = "auto";
  }
  return audioEl;
}

function revokeUrl() {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

function haltPlayback() {
  currentAbort?.abort();
  currentAbort = null;
  audioEl?.pause();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

export function speak(text: string, opts: SpeakOptions = {}) {
  const { rate = 1, onSpeakingChange, onLabelChange } = opts;
  if (typeof window === "undefined" || !text) {
    opts.onEnd?.();
    return;
  }

  playToken += 1;
  const token = playToken;
  haltPlayback();

  onSpeakingChange?.(true);
  onLabelChange?.("말하는 중…");

  const abort = new AbortController();
  currentAbort = abort;

  fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, rate }),
    signal: abort.signal,
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`tts ${res.status}`);
      const blob = await res.blob();
      if (token !== playToken) return; // superseded by a newer speak()

      const audio = getAudio();
      if (!audio) throw new Error("no audio element");

      revokeUrl();
      currentUrl = URL.createObjectURL(blob);
      audio.src = currentUrl;
      // Slow playback down without dropping the pitch. preservesPitch is on by
      // default in modern browsers; set it (and the older Safari alias)
      // explicitly so a slowed voice stays natural instead of going low.
      audio.preservesPitch = true;
      (audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch =
        true;
      audio.playbackRate = rate;

      audio.onended = () => {
        if (token !== playToken) return;
        onSpeakingChange?.(false);
        onLabelChange?.("다 읽었어요");
        opts.onEnd?.();
      };
      audio.onerror = () => {
        if (token !== playToken) return;
        fallbackSpeak(text, opts, token);
      };

      await audio.play();
    })
    .catch((err) => {
      if (abort.signal.aborted || token !== playToken) return;
      // Network/API failure or autoplay block → browser voice.
      console.warn("cloud tts failed, falling back", err);
      fallbackSpeak(text, opts, token);
    });
}

// The original Web Speech path, kept as a fallback. Splits into sentences
// because built-in voices handle short utterances more reliably.
function fallbackSpeak(text: string, opts: SpeakOptions, token: number) {
  const { rate = 1, onSpeakingChange, onLabelChange } = opts;
  if (!("speechSynthesis" in window)) {
    onSpeakingChange?.(false);
    opts.onEnd?.();
    return;
  }

  // Chrome leaves the queue paused after the tab loses focus (e.g. the native
  // camera/file picker opening) and never auto-resumes it, so every later
  // speak() call is silently swallowed unless we force a resume.
  window.speechSynthesis.resume();
  window.speechSynthesis.cancel();
  const parts = text.split(/(?<=[.!?。])\s+|\n+/).filter(Boolean);
  let i = 0;

  const next = () => {
    if (token !== playToken) return;
    if (i >= parts.length) {
      onSpeakingChange?.(false);
      onLabelChange?.("다 읽었어요");
      opts.onEnd?.();
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

  // Chrome silently drops speak() calls made synchronously right after cancel()
  // while a previous utterance was still playing — deferring by a tick avoids
  // the utterance never starting (no onstart/onerror at all).
  setTimeout(next, 50);
}

export function cancelSpeech() {
  if (typeof window === "undefined") return;
  playToken += 1; // invalidate any pending fetch/audio callbacks
  haltPlayback();
}

/**
 * Browsers only allow programmatic audio playback after a user gesture. The
 * camera/file picker tap is our gesture, so we prime the shared <audio> element
 * (and speechSynthesis, for the fallback) with silence here — the later async
 * play() from speak() would otherwise be blocked, especially on iOS.
 */
export function unlockTTS() {
  if (typeof window === "undefined") return;

  const audio = getAudio();
  if (audio) {
    try {
      audio.src = getSilentWav();
      audio
        .play()
        .then(() => audio.pause())
        .catch(() => {});
    } catch {
      // best-effort unlock
    }
  }

  if ("speechSynthesis" in window) {
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
      // The native file/camera picker opens right after and steals focus. If
      // this silent utterance is still queued then, browsers can leave it stuck
      // forever, jamming every speak() that follows. Cancel on the next tick.
      setTimeout(() => window.speechSynthesis.cancel(), 0);
    } catch {
      // ignore — best-effort unlock
    }
  }
}

// A tiny silent WAV, built in code so it's guaranteed valid, used only to bless
// the <audio> element inside the user gesture.
let silentWav: string | null = null;
function getSilentWav(): string {
  if (silentWav) return silentWav;
  const sampleRate = 8000;
  const samples = 400; // 0.05s of silence
  const dataLen = samples * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);
  // sample bytes are already zero (silence)
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  silentWav = "data:audio/wav;base64," + btoa(bin);
  return silentWav;
}
