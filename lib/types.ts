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
}

export type Screen = "home" | "wait" | "result" | "error" | "settings";
