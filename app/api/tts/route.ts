import { GoogleGenAI, Modality } from "@google/genai";
import { NextResponse } from "next/server";

// Gemini TTS runs on the same GEMINI_API_KEY as /api/analyze — no service
// account needed (unlike Cloud Text-to-Speech, which rejects API keys).
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
// A warm, natural voice. Others: Aoede, Leda, Puck, Charon, Zephyr, Fenrir…
const VOICE = process.env.GEMINI_TTS_VOICE || "Kore";

// Gemini returns raw signed 16-bit little-endian PCM; wrap it in a WAV header
// so the browser can play it directly.
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

// One synthesis attempt. Throws on API error or when no audio comes back, so
// both failure modes are retryable by the caller.
async function synthesize(text: string): Promise<ArrayBuffer> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
      },
    },
  });

  const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) throw new Error("no audio in response");

  // mimeType looks like "audio/L16;codec=pcm;rate=24000".
  const rateMatch = /rate=(\d+)/.exec(inline.mimeType ?? "");
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
  const wav = pcmToWav(Buffer.from(inline.data, "base64"), sampleRate);
  return wav.buffer.slice(
    wav.byteOffset,
    wav.byteOffset + wav.byteLength,
  ) as ArrayBuffer;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The preview TTS model has occasional transient blips; retry a couple of times
// before giving up, so the client only drops to the robotic fallback voice when
// Gemini is genuinely unavailable. Kept short — this runs while the user waits.
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "missing GEMINI_API_KEY" }, { status: 500 });
  }

  // Speech is always generated at a natural pace; playback speed is applied
  // client-side (audio.playbackRate) for precise, pitch-preserving control.
  const { text } = (await request.json()) as { text?: string };
  if (!text) {
    return NextResponse.json({ error: "missing text" }, { status: 400 });
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const body = await synthesize(text);
      return new NextResponse(body, {
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      lastErr = err;
      console.warn(`tts attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }
  }

  console.error("tts: all attempts failed", lastErr);
  const msg = lastErr instanceof Error ? lastErr.message : "tts error";
  return NextResponse.json({ error: msg }, { status: 502 });
}
