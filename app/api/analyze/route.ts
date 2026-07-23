import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { NextResponse } from "next/server";
import type { ExplanationLevel } from "@/lib/types";

const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

function isSupportedMediaType(v: string): v is SupportedMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(v);
}

function buildPrompt(level: ExplanationLevel) {
  const levelNote =
    level === "simple"
      ? "인지 수준이 7세 정도인 성인이 듣습니다. 한 문장을 아주 짧게. 어려운 낱말(예: 납부, 지참, 접수)은 절대 쓰지 말고 쉬운 말로 바꾸세요(내야 해요, 가져가야 해요, 신청해요)."
      : "초등학교 저학년이 이해할 수준의 쉬운 문장으로 설명하세요.";

  return `사진 속 문서(우편물, 안내문, 고지서, 문자 화면 등)를 읽고, 글을 읽지 못하는 사람에게 말로 설명해 주세요. ${levelNote}
반말이 아닌 친근한 해요체를 쓰세요. 유치하게 말하지 마세요. 듣는 사람은 성인입니다.

readable은 사진이 흐리거나 글자를 읽을 수 없으면 false로 하세요.
sender: 누가 보낸 것인지 한 문장 (예: 병원에서 온 편지예요)
message: 무슨 내용인지 1~2문장
action: 지금 해야 할 일 딱 하나, 한 문장. 할 일이 없으면 '지금 안 해도 돼요.'
important: 돈, 병원, 관공서, 날짜 약속 등 보호자가 알아야 하면 true
speech: 위 내용을 이어서 자연스럽게 말한 전체 문장. 짧은 문장 3~5개.`;
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    readable: { type: Type.BOOLEAN },
    sender: { type: Type.STRING },
    message: { type: Type.STRING },
    action: { type: Type.STRING },
    important: { type: Type.BOOLEAN },
    speech: { type: Type.STRING },
  },
  required: ["readable", "sender", "message", "action", "important", "speech"],
  propertyOrdering: [
    "readable",
    "sender",
    "message",
    "action",
    "important",
    "speech",
  ],
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(request: Request) {
  const body = await request.json();
  const { media, data, level } = body as {
    media?: string;
    data?: string;
    level?: ExplanationLevel;
  };

  if (!media || !data || !isSupportedMediaType(media)) {
    return NextResponse.json(
      { error: "unsupported or missing image" },
      { status: 400 },
    );
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(level ?? "simple") },
            { inlineData: { mimeType: media, data } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const parsed = JSON.parse(response.text ?? "{}");

    return NextResponse.json(parsed);
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "응답 오류";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
