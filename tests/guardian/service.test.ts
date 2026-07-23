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

import { processScan, type ScanInput } from "@/lib/guardian/service";
import type { GuardianDeps } from "@/lib/guardian/types";

function input(over: Partial<ScanInput> = {}): ScanInput {
  return {
    senderKey: "국민건강보험공단",
    sender: "건강보험공단에서 온 편지예요",
    message: "돈을 내야 해요",
    action: "이번 주에 은행에 가요",
    important: true,
    speech: "건강보험공단에서 편지가 왔어요.",
    imageData: Buffer.from("img"),
    imageMediaType: "image/jpeg",
    ...over,
  };
}

function makeDeps() {
  const store = createMemoryStore();
  const images = createMemoryImages();
  const sms = createMemorySms();
  const deps: GuardianDeps = {
    store,
    images,
    sms,
    baseUrl: "https://example.test",
  };
  return { deps, store, images, sms };
}

describe("processScan", () => {
  it("important + 번호 있음 → 저장·업로드·SMS·notified", async () => {
    const { deps, store, images, sms } = makeDeps();
    await store.setGuardianPhone("01012345678");
    const r = await processScan(deps, input());
    expect(r).toEqual({ repeat: false, notified: true });
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0].to).toBe("01012345678");
    expect(sms.sent[0].text).toContain("https://example.test/g/");
    expect(images.files.size).toBe(1);
    const saved = (await store.recentScans(1))[0];
    expect(saved.notified).toBe(true);
    expect(sms.sent[0].text).toContain(saved.sender);
  });

  it("번호 없으면 저장만 하고 알림 없음", async () => {
    const { deps, sms } = makeDeps();
    const r = await processScan(deps, input());
    expect(r).toEqual({ repeat: false, notified: false });
    expect(sms.sent).toHaveLength(0);
  });

  it("같은 발신자 두 번째 스캔은 repeat=true", async () => {
    const { deps } = makeDeps();
    await processScan(deps, input());
    const r = await processScan(deps, input());
    expect(r.repeat).toBe(true);
  });

  it("ignore 규칙이면 important여도 알림 억제, 기록은 남음", async () => {
    const { deps, store, sms } = makeDeps();
    await store.setGuardianPhone("01012345678");
    await store.setRule("국민건강보험공단", "ignore");
    const r = await processScan(deps, input());
    expect(r.notified).toBe(false);
    expect(sms.sent).toHaveLength(0);
    expect(await store.recentScans(10)).toHaveLength(1);
  });

  it("SMS 실패해도 throw하지 않고 notified=false로 저장", async () => {
    const { deps, store } = makeDeps();
    await store.setGuardianPhone("01012345678");
    deps.sms = {
      async send() {
        throw new Error("sms down");
      },
    };
    const r = await processScan(deps, input());
    expect(r.notified).toBe(false);
    expect((await store.recentScans(1))[0].notified).toBe(false);
  });
});
