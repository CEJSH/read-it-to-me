import { describe, expect, it } from "vitest";
import { newToken } from "@/lib/guardian/token";
import {
  createMemoryImages,
  createMemorySms,
  createMemoryStore,
} from "@/lib/guardian/memory";
import type { ScanRecord } from "@/lib/guardian/types";

function scan(over: Partial<ScanRecord> = {}): ScanRecord {
  return {
    id: "s1",
    token: "t1",
    createdAt: new Date().toISOString(),
    senderKey: "국민건강보험공단",
    sender: "건강보험공단에서 온 편지예요",
    message: "돈을 내야 해요",
    action: "이번 주에 은행에 가요",
    important: true,
    speech: "건강보험공단에서 편지가 왔어요.",
    imagePath: "scans/s1.jpg",
    imageMediaType: "image/jpeg",
    notified: false,
    ...over,
  };
}

describe("newToken", () => {
  it("URL-safe하고 충분히 길다", () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(newToken()).not.toBe(t);
  });
});

describe("memory store", () => {
  it("스캔 저장 후 토큰·최근목록·반복감지 조회", async () => {
    const store = createMemoryStore();
    expect(await store.hasPriorScan("국민건강보험공단")).toBe(false);
    await store.saveScan(scan());
    expect(await store.hasPriorScan("국민건강보험공단")).toBe(true);
    expect((await store.getScanByToken("t1"))?.id).toBe("s1");
    expect(await store.getScanByToken("nope")).toBeNull();
    await store.saveScan(scan({ id: "s2", token: "t2" }));
    const recent = await store.recentScans(10);
    expect(recent.map((s) => s.id)).toEqual(["s2", "s1"]); // 최신순
  });

  it("규칙과 전화번호 저장/해제", async () => {
    const store = createMemoryStore();
    expect(await store.getRule("k")).toBeNull();
    await store.setRule("k", "ignore");
    expect(await store.getRule("k")).toBe("ignore");
    await store.setRule("k", null);
    expect(await store.getRule("k")).toBeNull();
    expect(await store.getGuardianPhone()).toBeNull();
    await store.setGuardianPhone("01012345678");
    expect(await store.getGuardianPhone()).toBe("01012345678");
  });
});

describe("memory images / sms", () => {
  it("업로드한 파일을 스트림으로 돌려준다", async () => {
    const images = createMemoryImages();
    await images.upload(Buffer.from("img"), "image/jpeg", "scans/x.jpg");
    const got = await images.getStream("scans/x.jpg");
    expect(got?.contentType).toBe("image/jpeg");
    expect(await images.getStream("none")).toBeNull();
  });

  it("보낸 문자를 기록한다", async () => {
    const sms = createMemorySms();
    await sms.send("01012345678", "hello");
    expect(sms.sent).toEqual([{ to: "01012345678", text: "hello" }]);
  });
});
