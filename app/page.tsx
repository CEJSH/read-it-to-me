"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { TopBar } from "./components/TopBar";
import { HomeScreen } from "./components/HomeScreen";
import { WaitScreen } from "./components/WaitScreen";
import { ResultScreen } from "./components/ResultScreen";
import { ErrorScreen } from "./components/ErrorScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { useSettings } from "@/lib/useSettings";
import { resizeImage } from "@/lib/resizeImage";
import { cancelSpeech, initTTS, speak, unlockTTS } from "@/lib/tts";
import type {
  AnalyzeResult,
  ExplanationLevel,
  Screen,
  SpeechRate,
} from "@/lib/types";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const { settings, save } = useSettings();
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [errorDetail, setErrorDetail] = useState<string | undefined>();
  const [speaking, setSpeaking] = useState(false);
  const [speakLabel, setSpeakLabel] = useState("말하는 중…");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initTTS();
  }, []);

  function speakWithRate(text: string, rate: number) {
    speak(text, {
      rate,
      onSpeakingChange: setSpeaking,
      onLabelChange: setSpeakLabel,
    });
  }

  function speakText(text: string) {
    speakWithRate(text, settings.rate);
  }

  function openCamera() {
    fileInputRef.current?.click();
  }

  function retake() {
    cancelSpeech();
    fileInputRef.current?.click();
  }

  async function requestAnalysis(
    file: File,
    level: ExplanationLevel,
    max: number,
    quality: number,
  ): Promise<AnalyzeResult> {
    const img = await resizeImage(file, max, quality);
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...img, level }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || `API ${res.status}`);
    }
    return data as AnalyzeResult;
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    unlockTTS();
    setScreen("wait");
    speakText("읽고 있어요. 잠깐만 기다려요.");

    try {
      let data: AnalyzeResult;
      try {
        data = await requestAnalysis(file, settings.level, 1100, 0.72);
      } catch {
        // retry once with a much smaller image, same fallback as the prototype
        data = await requestAnalysis(file, settings.level, 800, 0.6);
      }
      handleResult(data);
    } catch (err) {
      console.error(err);
      fail(
        "잘 안 됐어요.\n한 번 더 찍어 주세요.",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  function handleResult(d: AnalyzeResult) {
    if (!d || d.readable === false) {
      fail(
        "사진이 잘 안 보여요.\n종이가 다 나오게,\n밝은 곳에서 다시 찍어 주세요.",
      );
      return;
    }
    setResult(d);
    setScreen("result");
    const full =
      d.speech || [d.sender, d.message, d.action].filter(Boolean).join(" ");
    let extra = "";
    if (d.repeat) extra += " 전에도 왔던 거예요. 지난번과 같아요.";
    if (d.notified) extra += " 이건 중요한 종이예요. 형한테 보냈어요.";
    else if (d.important) extra += " 이건 중요한 종이예요. 형한테 보여 주세요.";
    speakText(full + extra);
  }

  function fail(msg: string, detail?: string) {
    setErrorMsg(msg);
    setErrorDetail(detail);
    setScreen("error");
    speakText(msg.replace(/\n/g, " "));
  }

  function replay() {
    if (!result) return;
    const suffix = result.notified
      ? " 형한테 보냈어요."
      : result.important
        ? " 형한테 보여 주세요."
        : "";
    speakText((result.speech || "") + suffix);
  }

  async function share() {
    if (!result) return;
    const msg = `[읽어줄게] 동생이 찍은 문서예요.\n· 보낸 곳: ${result.sender}\n· 내용: ${result.message}\n· 할 일: ${result.action}`;
    try {
      if (navigator.share) {
        await navigator.share({ text: msg });
        speakText("형한테 보냈어요.");
      } else {
        await navigator.clipboard.writeText(msg);
        speakText("내용을 복사했어요. 메시지에 붙여넣어 보내세요.");
      }
    } catch {
      // user cancelled share / clipboard denied — silent, same as the prototype
    }
  }

  function openSettings() {
    cancelSpeech();
    setScreen("settings");
  }

  function changeRate(rate: SpeechRate) {
    save({ ...settings, rate });
    speakWithRate("이 빠르기로 말해요.", rate);
  }

  function changeLevel(level: ExplanationLevel) {
    save({ ...settings, level });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col p-4">
      <TopBar onOpenSettings={openSettings} />

      {screen === "home" && <HomeScreen onShoot={openCamera} />}
      {screen === "wait" && <WaitScreen />}
      {screen === "result" && result && (
        <ResultScreen
          result={result}
          speaking={speaking}
          speakLabel={speakLabel}
          onCardTap={speakText}
          onReplay={replay}
          onAgain={retake}
          onShare={share}
        />
      )}
      {screen === "error" && (
        <ErrorScreen message={errorMsg} detail={errorDetail} onRetry={retake} />
      )}
      {screen === "settings" && (
        <SettingsScreen
          settings={settings}
          onRateChange={changeRate}
          onLevelChange={changeLevel}
          onClose={() => setScreen("home")}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
