export type SpeechRate = 0.7 | 0.85 | 1;
export type ExplanationLevel = "simple" | "normal";

export interface Settings {
  rate: SpeechRate;
  level: ExplanationLevel;
}

export interface AnalyzeResult {
  readable: boolean;
  sender?: string;
  message?: string;
  action?: string;
  important?: boolean;
  speech?: string;
  senderKey?: string;
  /** 같은 발신자의 문서를 전에도 찍은 적 있음 (보호자 루프 활성 시) */
  repeat?: boolean;
  /** 보호자에게 SMS 알림이 실제 발송됨 */
  notified?: boolean;
}

export type Screen = "home" | "wait" | "result" | "error" | "settings";
