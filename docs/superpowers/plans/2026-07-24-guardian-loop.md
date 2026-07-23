# 보호자 루프 (Guardian Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** important 문서 감지 시 당사자 조작 없이 보호자에게 SMS로 보기 링크를 자동 발송하고, 스캔 기록·발신자 규칙·반복 감지를 서버에 저장한다.

**Architecture:** 기존 stateless 파이프라인(`/api/analyze`)에 best-effort 보호자 서비스(`lib/guardian/`)를 붙인다. 순수 판정 로직(`decide.ts`)과 오케스트레이션(`service.ts`)은 어댑터 인터페이스(store/images/sms) 뒤에서 동작해 인메모리 구현으로 단위 테스트한다. 실제 어댑터는 Upstash Redis(기록·규칙), Vercel Blob private(사진), Solapi(SMS). 보호자는 로그인 없이 128bit 토큰 링크 `/g/[token]`으로 문서를 본다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest(신규), `@upstash/redis`, `@vercel/blob`, `solapi`

## Global Constraints

- **보호자 루프 실패가 분석 응답을 절대 막지 않는다.** 저장·SMS 실패 시 `{ repeat: false, notified: false }`로 응답하고 서버 로그만 남긴다.
- **환경변수 미설정 시 보호자 루프 전체 비활성화** — 기존 stateless 동작과 동일해야 한다 (로컬 dev는 `GEMINI_API_KEY`만으로 지금처럼 동작).
- Next.js 16: page/route의 `params`·`searchParams`는 **Promise**이며 `await` 해야 한다. 코드 작성 전 `node_modules/next/dist/docs/` 확인 (AGENTS.md).
- 낭독 문구는 아래 값을 그대로 사용: 반복 = `" 전에도 왔던 거예요. 지난번과 같아요."`, 알림 성공 = `" 이건 중요한 종이예요. 형한테 보냈어요."`, 기존 문구(알림 실패/비활성) = `" 이건 중요한 종이예요. 형한테 보여 주세요."`
- 회원가입/로그인 없음. 토큰은 `crypto.randomBytes(16).toString("base64url")` (128bit).
- 커밋 메시지 끝: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

```
lib/guardian/
  types.ts      # ScanRecord, RuleMode, GuardianStore/ImageStore/SmsSender 인터페이스
  decide.ts     # 순수 함수 shouldNotify
  token.ts      # newToken()
  memory.ts     # 인메모리 store/images/sms (테스트용)
  service.ts    # processScan 오케스트레이션
  adapters.ts   # Redis/Blob/Solapi 실구현 + getGuardian() env 게이트
tests/guardian/
  decide.test.ts
  service.test.ts
app/api/guardian/
  phone/route.ts          # GET/POST 보호자 전화번호
  rule/route.ts           # POST 발신자 규칙 (token 기반)
  image/[token]/route.ts  # GET private blob 프록시
app/g/
  page.tsx                # 최근 목록 (?key= 게이트)
  [token]/page.tsx        # 문서 1건 보기
  RuleButtons.tsx         # 규칙 등록 클라이언트 컴포넌트
수정: app/api/analyze/route.ts, lib/types.ts, app/page.tsx,
      app/components/SettingsScreen.tsx, app/components/ResultScreen.tsx,
      package.json, vitest.config.ts, .env.local.example, README.md
```

---

### Task 1: 테스트 인프라 + 타입 + 판정 로직

**Files:**
- Modify: `package.json` (vitest, test 스크립트)
- Create: `vitest.config.ts`
- Create: `lib/guardian/types.ts`
- Create: `lib/guardian/decide.ts`
- Test: `tests/guardian/decide.test.ts`

**Interfaces:**
- Produces: `ScanRecord`, `RuleMode`, `GuardianStore`, `ImageStore`, `SmsSender`, `shouldNotify(important, rule, hasPhone, hasSms): boolean` — 이후 모든 태스크가 사용.

- [ ] **Step 1: vitest 설치 및 설정**

```bash
npm i -D vitest
```

`package.json` scripts에 추가: `"test": "vitest run"`

`vitest.config.ts` 생성:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 2: 타입 정의 작성** — `lib/guardian/types.ts`

```ts
export type RuleMode = "ignore" | "always";

export interface ScanRecord {
  id: string;
  token: string; // 보호자 보기 링크용 capability 토큰
  createdAt: string; // ISO
  senderKey: string;
  sender: string;
  message: string;
  action: string;
  important: boolean;
  speech: string;
  imagePath: string; // Blob pathname
  imageMediaType: string;
  notified: boolean;
}

export interface GuardianStore {
  getRule(senderKey: string): Promise<RuleMode | null>;
  setRule(senderKey: string, mode: RuleMode | null): Promise<void>;
  hasPriorScan(senderKey: string): Promise<boolean>;
  saveScan(scan: ScanRecord): Promise<void>;
  getScanByToken(token: string): Promise<ScanRecord | null>;
  recentScans(limit: number): Promise<ScanRecord[]>;
  getGuardianPhone(): Promise<string | null>;
  setGuardianPhone(phone: string): Promise<void>;
}

export interface ImageStore {
  upload(data: Buffer, mediaType: string, pathname: string): Promise<void>;
  getStream(
    pathname: string,
  ): Promise<{ stream: ReadableStream; contentType: string } | null>;
}

export interface SmsSender {
  send(to: string, text: string): Promise<void>;
}

export interface GuardianDeps {
  store: GuardianStore;
  images: ImageStore;
  sms: SmsSender | null; // SMS env 미설정 시 null — 알림만 꺼짐
  baseUrl: string; // 링크 생성용, 예: https://read-it-to-me.vercel.app
}
```

- [ ] **Step 3: 실패하는 테스트 작성** — `tests/guardian/decide.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { shouldNotify } from "@/lib/guardian/decide";

describe("shouldNotify", () => {
  it("important 문서는 알림", () => {
    expect(shouldNotify(true, null, true, true)).toBe(true);
  });
  it("비중요 문서는 알림 안 함", () => {
    expect(shouldNotify(false, null, true, true)).toBe(false);
  });
  it("ignore 규칙은 important여도 억제", () => {
    expect(shouldNotify(true, "ignore", true, true)).toBe(false);
  });
  it("always 규칙은 비중요여도 알림", () => {
    expect(shouldNotify(false, "always", true, true)).toBe(true);
  });
  it("보호자 번호 없으면 항상 억제", () => {
    expect(shouldNotify(true, "always", false, true)).toBe(false);
  });
  it("SMS 발송 수단 없으면 항상 억제", () => {
    expect(shouldNotify(true, "always", true, false)).toBe(false);
  });
});
```

- [ ] **Step 4: 실패 확인**

Run: `npx vitest run tests/guardian/decide.test.ts`
Expected: FAIL — `Cannot find module '@/lib/guardian/decide'`

- [ ] **Step 5: 구현** — `lib/guardian/decide.ts`

```ts
import type { RuleMode } from "./types";

/** 알림 발송 여부. 규칙 > important 순으로 판정하되, 발송 수단이 없으면 항상 false. */
export function shouldNotify(
  important: boolean,
  rule: RuleMode | null,
  hasPhone: boolean,
  hasSms: boolean,
): boolean {
  if (!hasPhone || !hasSms) return false;
  if (rule === "ignore") return false;
  if (rule === "always") return true;
  return important;
}
```

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run tests/guardian/decide.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/guardian/types.ts lib/guardian/decide.ts tests/guardian/decide.test.ts
git commit -m "feat: add guardian types and notify decision logic with vitest setup"
```

---

### Task 2: 토큰 생성 + 인메모리 어댑터

**Files:**
- Create: `lib/guardian/token.ts`
- Create: `lib/guardian/memory.ts`
- Test: `tests/guardian/service.test.ts` (이 태스크에서는 memory 어댑터 검증 부분만)

**Interfaces:**
- Consumes: Task 1의 `GuardianStore`, `ImageStore`, `SmsSender`, `ScanRecord`
- Produces: `newToken(): string`, `createMemoryStore(): GuardianStore`, `createMemoryImages(): ImageStore & { files: Map<string, { data: Buffer; mediaType: string }> }`, `createMemorySms(): SmsSender & { sent: { to: string; text: string }[] }`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/guardian/service.test.ts` 생성 (memory 어댑터 검증)

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/guardian/service.test.ts`
Expected: FAIL — `Cannot find module '@/lib/guardian/token'`

- [ ] **Step 3: 구현** — `lib/guardian/token.ts`

```ts
import { randomBytes } from "node:crypto";

/** 128bit URL-safe capability 토큰. */
export function newToken(): string {
  return randomBytes(16).toString("base64url");
}
```

`lib/guardian/memory.ts`:

```ts
import type {
  GuardianStore,
  ImageStore,
  RuleMode,
  ScanRecord,
  SmsSender,
} from "./types";

export function createMemoryStore(): GuardianStore {
  const scans: ScanRecord[] = []; // 최신이 앞
  const rules = new Map<string, RuleMode>();
  let phone: string | null = null;

  return {
    async getRule(senderKey) {
      return rules.get(senderKey) ?? null;
    },
    async setRule(senderKey, mode) {
      if (mode === null) rules.delete(senderKey);
      else rules.set(senderKey, mode);
    },
    async hasPriorScan(senderKey) {
      return scans.some((s) => s.senderKey === senderKey);
    },
    async saveScan(scan) {
      scans.unshift(scan);
    },
    async getScanByToken(token) {
      return scans.find((s) => s.token === token) ?? null;
    },
    async recentScans(limit) {
      return scans.slice(0, limit);
    },
    async getGuardianPhone() {
      return phone;
    },
    async setGuardianPhone(next) {
      phone = next;
    },
  };
}

export function createMemoryImages(): ImageStore & {
  files: Map<string, { data: Buffer; mediaType: string }>;
} {
  const files = new Map<string, { data: Buffer; mediaType: string }>();
  return {
    files,
    async upload(data, mediaType, pathname) {
      files.set(pathname, { data, mediaType });
    },
    async getStream(pathname) {
      const f = files.get(pathname);
      if (!f) return null;
      return {
        stream: new Blob([new Uint8Array(f.data)]).stream(),
        contentType: f.mediaType,
      };
    },
  };
}

export function createMemorySms(): SmsSender & {
  sent: { to: string; text: string }[];
} {
  const sent: { to: string; text: string }[] = [];
  return {
    sent,
    async send(to, text) {
      sent.push({ to, text });
    },
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/guardian/service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/guardian/token.ts lib/guardian/memory.ts tests/guardian/service.test.ts
git commit -m "feat: add guardian token generator and in-memory adapters"
```

---

### Task 3: processScan 오케스트레이션

**Files:**
- Create: `lib/guardian/service.ts`
- Test: `tests/guardian/service.test.ts` (추가)

**Interfaces:**
- Consumes: Task 1 타입·`shouldNotify`, Task 2 memory 어댑터·`newToken`
- Produces: `processScan(deps: GuardianDeps, input: ScanInput): Promise<{ repeat: boolean; notified: boolean }>` 및 `ScanInput` 타입 — Task 5의 analyze 라우트가 호출.

- [ ] **Step 1: 실패하는 테스트 추가** — `tests/guardian/service.test.ts` 하단에 추가

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/guardian/service.test.ts`
Expected: FAIL — `Cannot find module '@/lib/guardian/service'`

- [ ] **Step 3: 구현** — `lib/guardian/service.ts`

```ts
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
```

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `npm test`
Expected: PASS (decide 6 + service 스위트 전부)

- [ ] **Step 5: Commit**

```bash
git add lib/guardian/service.ts tests/guardian/service.test.ts
git commit -m "feat: add guardian processScan orchestration"
```

---

### Task 4: 실어댑터 (Redis·Blob·Solapi) + env 게이트

**Files:**
- Create: `lib/guardian/adapters.ts`
- Modify: `package.json` (의존성)

**Interfaces:**
- Consumes: Task 1의 인터페이스들
- Produces: `getGuardian(): GuardianDeps | null` — Redis/Blob env가 없으면 null(루프 비활성). Task 5·6·7이 사용. 개별 함수 `createRedisStore()`, `createBlobImages()`, `createSolapiSms(): SmsSender | null`도 export.

주의: 얇은 I/O 어댑터라 단위 테스트 없음. 컴파일·lint로 검증하고 실동작은 Task 9 수동 테스트에서 확인.

- [ ] **Step 1: 의존성 설치**

```bash
npm i @upstash/redis @vercel/blob solapi
```

- [ ] **Step 2: 구현** — `lib/guardian/adapters.ts`

```ts
import { Redis } from "@upstash/redis";
import { get, put } from "@vercel/blob";
import { SolapiMessageService } from "solapi";
import type {
  GuardianDeps,
  GuardianStore,
  ImageStore,
  RuleMode,
  ScanRecord,
  SmsSender,
} from "./types";

const RECENT_KEY = "scans:recent";
const RECENT_MAX = 100;

export function createRedisStore(): GuardianStore {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  return {
    async getRule(senderKey) {
      return (await redis.get<RuleMode>(`rule:${senderKey}`)) ?? null;
    },
    async setRule(senderKey, mode) {
      if (mode === null) await redis.del(`rule:${senderKey}`);
      else await redis.set(`rule:${senderKey}`, mode);
    },
    async hasPriorScan(senderKey) {
      return (await redis.llen(`sender:${senderKey}:scans`)) > 0;
    },
    async saveScan(scan) {
      await Promise.all([
        redis.set(`scan:${scan.id}`, scan),
        redis.set(`view:${scan.token}`, scan.id),
        redis.lpush(`sender:${scan.senderKey}:scans`, scan.id),
        redis.lpush(RECENT_KEY, scan.id),
      ]);
      await redis.ltrim(RECENT_KEY, 0, RECENT_MAX - 1);
    },
    async getScanByToken(token) {
      const id = await redis.get<string>(`view:${token}`);
      if (!id) return null;
      return (await redis.get<ScanRecord>(`scan:${id}`)) ?? null;
    },
    async recentScans(limit) {
      const ids = await redis.lrange(RECENT_KEY, 0, limit - 1);
      if (ids.length === 0) return [];
      const scans = await Promise.all(
        ids.map((id) => redis.get<ScanRecord>(`scan:${id}`)),
      );
      return scans.filter((s): s is ScanRecord => s !== null);
    },
    async getGuardianPhone() {
      return (await redis.get<string>("guardian:phone")) ?? null;
    },
    async setGuardianPhone(phone) {
      await redis.set("guardian:phone", phone);
    },
  };
}

export function createBlobImages(): ImageStore {
  return {
    async upload(data, mediaType, pathname) {
      await put(pathname, new Uint8Array(data), {
        access: "private",
        contentType: mediaType,
      });
    },
    async getStream(pathname) {
      const result = await get(pathname, {
        access: "private",
        token: process.env.BLOB_READ_WRITE_TOKEN!,
      });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return {
        stream: result.stream,
        contentType: result.blob.contentType || "image/jpeg",
      };
    },
  };
}

export function createSolapiSms(): SmsSender | null {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  const from = process.env.SOLAPI_SENDER_PHONE;
  if (!key || !secret || !from) return null;

  const service = new SolapiMessageService(key, secret);
  return {
    async send(to, text) {
      await service.send({ to, from, text });
    },
  };
}

/** Redis+Blob env가 모두 있어야 보호자 루프 활성. 없으면 null → 기존 stateless 동작. */
export function getGuardian(): GuardianDeps | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN ||
    !process.env.BLOB_READ_WRITE_TOKEN
  ) {
    return null;
  }
  return {
    store: createRedisStore(),
    images: createBlobImages(),
    sms: createSolapiSms(),
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
  };
}
```

- [ ] **Step 3: 컴파일·lint 확인**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 없음. (참고: `@vercel/blob`의 `get` 반환 형태가 설치 버전과 다르면 `node_modules/@vercel/blob/dist/*.d.ts`를 열어 시그니처에 맞게 수정할 것 — 인터페이스 `ImageStore`는 유지.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/guardian/adapters.ts
git commit -m "feat: add redis/blob/solapi guardian adapters with env gate"
```

---

### Task 5: /api/analyze 통합 (senderKey + 보호자 파이프라인)

**Files:**
- Modify: `app/api/analyze/route.ts`
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: Task 3 `processScan`, Task 4 `getGuardian`
- Produces: `/api/analyze` 응답에 `senderKey?: string; repeat?: boolean; notified?: boolean` 추가. `AnalyzeResult`도 동일 확장 — Task 8 클라이언트가 사용.

- [ ] **Step 1: `lib/types.ts`의 `AnalyzeResult` 확장**

```ts
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
```

- [ ] **Step 2: `app/api/analyze/route.ts` 수정**

(a) 프롬프트 끝(`speech:` 줄 다음)에 추가:

```
senderKey: 발신 기관의 짧은 정규화된 이름 (예: '국민건강보험공단', '서울대학교병원', 'KT'). 같은 기관이면 항상 같은 값을 쓰세요. 알 수 없으면 '알수없음'.
```

(b) `RESPONSE_SCHEMA`의 `properties`에 `senderKey: { type: Type.STRING }` 추가, `required`와 `propertyOrdering` 배열 끝에 `"senderKey"` 추가.

(c) import 추가:

```ts
import { getGuardian } from "@/lib/guardian/adapters";
import { processScan } from "@/lib/guardian/service";
```

(d) `POST`에서 `const parsed = JSON.parse(response.text ?? "{}");` 와 `return NextResponse.json(parsed);` 사이에 삽입:

```ts
    // 보호자 루프: best-effort. 실패해도 분석 응답은 그대로 나간다.
    let repeat = false;
    let notified = false;
    const guardian = getGuardian();
    if (guardian && parsed.readable !== false) {
      try {
        const r = await processScan(guardian, {
          senderKey: parsed.senderKey || "알수없음",
          sender: parsed.sender ?? "",
          message: parsed.message ?? "",
          action: parsed.action ?? "",
          important: parsed.important === true,
          speech: parsed.speech ?? "",
          imageData: Buffer.from(data, "base64"),
          imageMediaType: media,
        });
        repeat = r.repeat;
        notified = r.notified;
      } catch (err) {
        console.error("guardian loop failed (non-fatal)", err);
      }
    }

    return NextResponse.json({ ...parsed, repeat, notified });
```

(기존 `return NextResponse.json(parsed);` 는 위 블록의 마지막 줄로 대체.)

- [ ] **Step 3: 검증**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: 전부 통과. env 없는 상태에서 `npm run dev` 후 사진 분석이 기존과 동일하게 동작(guardian은 null이라 skip)하는지 확인.

- [ ] **Step 4: Commit**

```bash
git add app/api/analyze/route.ts lib/types.ts
git commit -m "feat: wire guardian loop into analyze route with senderKey"
```

---

### Task 6: 보호자 API 라우트 (phone·rule·image)

**Files:**
- Create: `app/api/guardian/phone/route.ts`
- Create: `app/api/guardian/rule/route.ts`
- Create: `app/api/guardian/image/[token]/route.ts`

**Interfaces:**
- Consumes: Task 4 `getGuardian`
- Produces:
  - `GET /api/guardian/phone` → `{ enabled: boolean; phone: string | null }`
  - `POST /api/guardian/phone` body `{ phone: string }` → `{ ok: true }`
  - `POST /api/guardian/rule` body `{ token: string; mode: "ignore" | "always" | "none" }` → `{ ok: true; mode: RuleMode | null }`
  - `GET /api/guardian/image/[token]` → 이미지 스트림 (Task 7의 `<img>`가 사용)

- [ ] **Step 1: `app/api/guardian/phone/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getGuardian } from "@/lib/guardian/adapters";

export async function GET() {
  const guardian = getGuardian();
  if (!guardian) return NextResponse.json({ enabled: false, phone: null });
  const phone = await guardian.store.getGuardianPhone();
  return NextResponse.json({ enabled: true, phone });
}

export async function POST(request: Request) {
  const guardian = getGuardian();
  if (!guardian) {
    return NextResponse.json({ error: "guardian disabled" }, { status: 503 });
  }
  const { phone } = (await request.json()) as { phone?: string };
  const cleaned = (phone ?? "").replace(/[^0-9]/g, "");
  if (!/^01[016789][0-9]{7,8}$/.test(cleaned)) {
    return NextResponse.json({ error: "invalid phone" }, { status: 400 });
  }
  await guardian.store.setGuardianPhone(cleaned);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `app/api/guardian/rule/route.ts`** — 토큰이 곧 권한: 해당 문서를 볼 수 있는 사람만 그 발신자 규칙을 바꿀 수 있다.

```ts
import { NextResponse } from "next/server";
import { getGuardian } from "@/lib/guardian/adapters";

export async function POST(request: Request) {
  const guardian = getGuardian();
  if (!guardian) {
    return NextResponse.json({ error: "guardian disabled" }, { status: 503 });
  }
  const { token, mode } = (await request.json()) as {
    token?: string;
    mode?: "ignore" | "always" | "none";
  };
  if (!token || !mode || !["ignore", "always", "none"].includes(mode)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const scan = await guardian.store.getScanByToken(token);
  if (!scan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const next = mode === "none" ? null : mode;
  await guardian.store.setRule(scan.senderKey, next);
  return NextResponse.json({ ok: true, mode: next });
}
```

- [ ] **Step 3: `app/api/guardian/image/[token]/route.ts`** — private Blob 프록시. `params`는 Promise (Next 16).

```ts
import { NextResponse } from "next/server";
import { getGuardian } from "@/lib/guardian/adapters";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const guardian = getGuardian();
  if (!guardian) return new NextResponse(null, { status: 503 });

  const { token } = await params;
  const scan = await guardian.store.getScanByToken(token);
  if (!scan) return new NextResponse(null, { status: 404 });

  const image = await guardian.images.getStream(scan.imagePath);
  if (!image) return new NextResponse(null, { status: 404 });

  return new NextResponse(image.stream, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
```

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add app/api/guardian
git commit -m "feat: add guardian phone, rule, and image proxy routes"
```

---

### Task 7: 보호자 뷰 페이지 (/g, /g/[token])

**Files:**
- Create: `app/g/[token]/page.tsx`
- Create: `app/g/RuleButtons.tsx`
- Create: `app/g/page.tsx`

**Interfaces:**
- Consumes: Task 4 `getGuardian`, Task 6 `/api/guardian/rule`, `/api/guardian/image/[token]`
- Produces: 보호자용 화면 2개. SMS 링크(`/g/<token>`)의 목적지.

- [ ] **Step 1: `app/g/RuleButtons.tsx`** — 클라이언트 컴포넌트 (규칙 등록)

```tsx
"use client";

import { useState } from "react";
import type { RuleMode } from "@/lib/guardian/types";

export function RuleButtons({
  token,
  senderKey,
  initialMode,
}: {
  token: string;
  senderKey: string;
  initialMode: RuleMode | null;
}) {
  const [mode, setMode] = useState<RuleMode | null>(initialMode);
  const [busy, setBusy] = useState(false);

  async function apply(next: RuleMode | null) {
    setBusy(true);
    try {
      const res = await fetch("/api/guardian/rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, mode: next ?? "none" }),
      });
      if (res.ok) setMode(next);
    } finally {
      setBusy(false);
    }
  }

  function btn(target: RuleMode, label: string) {
    const active = mode === target;
    return (
      <button
        disabled={busy}
        onClick={() => apply(active ? null : target)}
        className={`flex-1 rounded-[14px] border-2 px-3.5 py-3 text-[15px] font-bold ${
          active ? "border-blue bg-blue text-white" : "border-line bg-white"
        }`}
      >
        {active ? `${label} ✓ (해제)` : label}
      </button>
    );
  }

  return (
    <div className="rounded-[20px] border border-line bg-card p-[18px] shadow-soft">
      <p className="mb-2.5 text-[15px] font-bold text-sub">
        &lsquo;{senderKey}&rsquo; 발신자 규칙
      </p>
      <div className="flex gap-2">
        {btn("ignore", "이 발신자는 무시")}
        {btn("always", "항상 알림")}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `app/g/[token]/page.tsx`** — 서버 컴포넌트. `params`는 Promise.

```tsx
import { getGuardian } from "@/lib/guardian/adapters";
import { RuleButtons } from "../RuleButtons";

export default async function GuardianView({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const guardian = getGuardian();
  const { token } = await params;
  const scan = guardian ? await guardian.store.getScanByToken(token) : null;

  if (!guardian || !scan) {
    return (
      <main className="mx-auto max-w-[520px] p-6">
        <p className="text-lg font-bold">문서를 찾을 수 없어요.</p>
      </main>
    );
  }

  const rule = await guardian.store.getRule(scan.senderKey);
  const when = new Date(scan.createdAt).toLocaleString("ko-KR");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col gap-3.5 p-4">
      <h1 className="mx-1 my-1.5 text-[22px] font-extrabold">
        📄 동생이 찍은 문서
      </h1>
      <p className="mx-1 text-sm text-sub">{when}</p>

      {/* eslint-disable-next-line @next/next/no-img-element -- private blob 프록시라 next/image 최적화 대상 아님 */}
      <img
        src={`/api/guardian/image/${token}`}
        alt="동생이 촬영한 문서 사진"
        className="w-full rounded-[20px] border border-line"
      />

      {[
        { icon: "✉️", title: "누가 보냈어요", text: scan.sender },
        { icon: "💬", title: "무슨 내용이에요", text: scan.message },
        { icon: "✅", title: "할 일", text: scan.action },
      ].map((c) => (
        <div
          key={c.title}
          className="flex items-start gap-4 rounded-[20px] border border-line bg-card px-5 py-[18px] shadow-soft"
        >
          <span className="text-[28px] leading-none">{c.icon}</span>
          <span className="flex flex-col">
            <span className="mb-1 text-[14px] font-extrabold text-sub">
              {c.title}
            </span>
            <span className="text-lg font-bold leading-[1.45]">{c.text}</span>
          </span>
        </div>
      ))}

      <RuleButtons token={token} senderKey={scan.senderKey} initialMode={rule} />
    </main>
  );
}
```

- [ ] **Step 3: `app/g/page.tsx`** — 최근 목록. `searchParams`는 Promise. `GUARDIAN_ACCESS_KEY` 게이트.

```tsx
import Link from "next/link";
import { getGuardian } from "@/lib/guardian/adapters";

export default async function GuardianList({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const accessKey = process.env.GUARDIAN_ACCESS_KEY;
  const guardian = getGuardian();

  if (!guardian || !accessKey || key !== accessKey) {
    return (
      <main className="mx-auto max-w-[520px] p-6">
        <p className="text-lg font-bold">접근 권한이 없어요.</p>
      </main>
    );
  }

  const scans = await guardian.store.recentScans(50);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col gap-3 p-4">
      <h1 className="mx-1 my-1.5 text-[22px] font-extrabold">
        📚 최근 문서 기록
      </h1>
      {scans.length === 0 && (
        <p className="mx-1 text-sub">아직 기록이 없어요.</p>
      )}
      {scans.map((s) => (
        <Link
          key={s.id}
          href={`/g/${s.token}`}
          className={`flex items-center gap-3 rounded-[20px] border px-5 py-4 shadow-soft ${
            s.important ? "border-amber/60 bg-[#FFF7EE]" : "border-line bg-card"
          }`}
        >
          <span className="text-[24px]">{s.important ? "⚠️" : "📄"}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-bold">{s.sender}</span>
            <span className="text-sm text-sub">
              {new Date(s.createdAt).toLocaleString("ko-KR")}
              {s.notified ? " · 문자 보냄" : ""}
            </span>
          </span>
        </Link>
      ))}
    </main>
  );
}
```

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 빌드 성공. (`/g`·`/g/[token]`은 env 없이도 "찾을 수 없어요/권한 없음" 화면으로 빌드·렌더 가능해야 함.)

- [ ] **Step 5: Commit**

```bash
git add app/g
git commit -m "feat: add guardian view pages with sender rule buttons"
```

---

### Task 8: 당사자 앱 UI (전화번호 설정·낭독 문구·알림 뱃지)

**Files:**
- Modify: `app/components/SettingsScreen.tsx`
- Modify: `app/components/ResultScreen.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: Task 5 `AnalyzeResult.repeat/notified`, Task 6 `/api/guardian/phone`
- Produces: 사용자에게 보이는 최종 동작.

- [ ] **Step 1: `SettingsScreen`에 보호자 전화번호 카드 추가** — 파일 상단을 클라이언트 훅 사용 형태로 바꾸고, "설명 수준" 카드와 "사용법" 카드 사이에 삽입.

파일 맨 위에 추가:

```tsx
"use client";

import { useEffect, useState } from "react";
```

컴포넌트 함수 본문 시작부에 추가:

```tsx
  const [phone, setPhone] = useState("");
  const [phoneEnabled, setPhoneEnabled] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);

  useEffect(() => {
    fetch("/api/guardian/phone")
      .then((r) => r.json())
      .then((d: { enabled: boolean; phone: string | null }) => {
        setPhoneEnabled(d.enabled);
        if (d.phone) setPhone(d.phone);
      })
      .catch(() => setPhoneEnabled(false));
  }, []);

  async function savePhone() {
    if (!phoneEnabled || !phone) return;
    try {
      const res = await fetch("/api/guardian/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      setPhoneSaved(res.ok);
    } catch {
      setPhoneSaved(false);
    }
  }
```

"설명 수준" 카드 `</div>` 다음에 카드 삽입 (phoneEnabled일 때만):

```tsx
      {phoneEnabled && (
        <div className="rounded-[20px] border border-line bg-card p-[18px] shadow-soft">
          <label className="mb-2.5 block text-[17px] font-bold">
            형(보호자) 전화번호
          </label>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneSaved(false);
            }}
            placeholder="01012345678"
            className="w-full rounded-[14px] border-2 border-line bg-white px-3.5 py-3.5 text-[17px] font-bold"
          />
          <p className="mt-2 text-sm leading-[1.6] text-sub">
            중요한 문서가 오면 이 번호로 문자를 보내요.
            {phoneSaved && " ✓ 저장했어요."}
          </p>
        </div>
      )}
```

"저장하고 닫기" 버튼의 onClick을 변경:

```tsx
        onClick={async () => {
          await savePhone();
          onClose();
        }}
```

- [ ] **Step 2: `ResultScreen`에 알림 뱃지** — 상태 표시줄(`speakLabel` div) 안, `<span>{speakLabel}</span>` 다음에 추가:

```tsx
        {result.notified && (
          <span className="ml-auto rounded-full bg-violet px-3 py-1 text-sm font-bold text-white">
            형한테 보냈어요 ✓
          </span>
        )}
```

- [ ] **Step 3: `app/page.tsx`의 `handleResult` 낭독 문구 교체** — 기존:

```ts
    const extra = d.important
      ? " 이건 중요한 종이예요. 형한테 보여 주세요."
      : "";
```

교체:

```ts
    let extra = "";
    if (d.repeat) extra += " 전에도 왔던 거예요. 지난번과 같아요.";
    if (d.notified) extra += " 이건 중요한 종이예요. 형한테 보냈어요.";
    else if (d.important) extra += " 이건 중요한 종이예요. 형한테 보여 주세요.";
```

`replay()`도 동일 규칙으로 교체 — 기존:

```ts
    speakText(
      (result.speech || "") + (result.important ? " 형한테 보여 주세요." : ""),
    );
```

교체:

```ts
    const suffix = result.notified
      ? " 형한테 보냈어요."
      : result.important
        ? " 형한테 보여 주세요."
        : "";
    speakText((result.speech || "") + suffix);
```

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 통과. env 없이 `npm run dev`로 설정 화면 열어 전화번호 카드가 **안 보이는지**(enabled=false), 분석·낭독이 기존대로 동작하는지 확인.

- [ ] **Step 5: Commit**

```bash
git add app/components/SettingsScreen.tsx app/components/ResultScreen.tsx app/page.tsx
git commit -m "feat: guardian phone setting, notified badge, and speech updates"
```

---

### Task 9: 문서 갱신 + 수동 E2E 체크리스트

**Files:**
- Modify: `.env.local.example`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-24-guardian-loop-design.md` (서빙 방식 한 줄 정정)

- [ ] **Step 1: `.env.local.example`에 추가**

```bash
# --- 보호자 루프 (선택; 없으면 루프 전체 비활성, 기존 동작 유지) ---
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=
# BLOB_READ_WRITE_TOKEN=
# NEXT_PUBLIC_BASE_URL=http://localhost:3000
# GUARDIAN_ACCESS_KEY=      # /g 목록 접근 키 (아무 긴 랜덤 문자열)
# --- SMS (선택; 없으면 기록만 하고 문자 미발송) ---
# SOLAPI_API_KEY=
# SOLAPI_API_SECRET=
# SOLAPI_SENDER_PHONE=      # 솔라피에 사전 등록된 발신번호
```

- [ ] **Step 2: README에 "보호자 루프" 섹션 추가** — "동작 방식" 아래에 흐름(자동 문자·`/g` 링크·발신자 규칙·반복 안심), 환경변수 표, "env 없으면 비활성" 명시. 스펙 문서의 "서명 URL" 문구는 "토큰 게이트 프록시 라우트(`/api/guardian/image/[token]`)로 서빙"으로 정정.

- [ ] **Step 3: 전체 검증**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: 전부 통과.

- [ ] **Step 4: 수동 E2E (실서비스 env 세팅 후, 실기기)**

1. important 문서 촬영 → 낭독에 "형한테 보냈어요" → 보호자 폰에 문자 수신 → 링크에서 사진·요약 확인
2. 같은 고지서 재촬영 → "전에도 왔던 거예요" 낭독
3. `/g/<token>`에서 "이 발신자는 무시" 등록 → 재촬영 → 문자 없음, `/g?key=`목록엔 기록 존재
4. "항상 알림" 등록 → 비중요 문서 촬영 → 문자 수신
5. env 제거 상태 → 기존 stateless 동작 확인

- [ ] **Step 5: Commit**

```bash
git add .env.local.example README.md docs/superpowers/specs/2026-07-24-guardian-loop-design.md
git commit -m "docs: document guardian loop setup and env vars"
```
