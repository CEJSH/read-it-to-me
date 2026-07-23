import { shouldNotify } from "./decide";
import { newToken } from "./token";
import type { GuardianDeps, ScanRecord } from "./types";

export interface ScanInput {
  senderKey: string;
  sender: string;
  message: string;
  action: string;
  important: boolean;
  speech: string;
  imageData: Buffer;
  imageMediaType: string;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * 스캔 1건을 기록하고 필요 시 보호자에게 알린다. 이미지 업로드/저장 실패는
 * throw되어 호출자(analyze 라우트)가 best-effort로 무시한다. SMS 실패만은
 * 여기서 삼킨다 — 기록은 남기되 notified=false로.
 */
export async function processScan(
  deps: GuardianDeps,
  input: ScanInput,
): Promise<{ repeat: boolean; notified: boolean }> {
  const { store, images, sms, baseUrl } = deps;

  const [rule, repeat, phone] = await Promise.all([
    store.getRule(input.senderKey),
    store.hasPriorScan(input.senderKey),
    store.getGuardianPhone(),
  ]);

  const id = newToken(); // id도 추측 불가 랜덤이면 충분
  const token = newToken();
  const ext = EXT_BY_TYPE[input.imageMediaType] ?? "jpg";
  const imagePath = `scans/${id}.${ext}`;

  await images.upload(input.imageData, input.imageMediaType, imagePath);

  let notified = false;
  if (shouldNotify(input.important, rule, phone !== null, sms !== null)) {
    try {
      await sms!.send(
        phone!,
        `[읽어줄게] 동생에게 중요한 문서가 왔어요. ${input.sender} ${baseUrl}/g/${token}`,
      );
      notified = true;
    } catch (err) {
      console.error("guardian sms failed", err);
    }
  }

  const record: ScanRecord = {
    id,
    token,
    createdAt: new Date().toISOString(),
    senderKey: input.senderKey,
    sender: input.sender,
    message: input.message,
    action: input.action,
    important: input.important,
    speech: input.speech,
    imagePath,
    imageMediaType: input.imageMediaType,
    notified,
  };
  await store.saveScan(record);

  return { repeat, notified };
}
