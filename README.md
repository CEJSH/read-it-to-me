# 읽어줄게 (read-it-to-me)

글을 읽기 어려운 사람을 위한 문서 낭독 도우미. 우편물·고지서·안내문·문자 화면 등을 **사진으로 찍으면**, AI가 내용을 읽고 이해해서 **쉬운 말로 소리 내어 읽어 줍니다.**

인지·읽기에 어려움이 있는 성인, 시력이 약한 어르신 등이 혼자서도 "이 종이가 뭔지, 지금 뭘 해야 하는지"를 알 수 있도록 만든 모바일 웹 앱입니다.

## 동작 방식

```
사진 촬영 → 이미지 축소 → Gemini 분석(JSON) → 결과 화면 + 음성 낭독
```

1. **촬영** — 홈 화면의 큰 버튼을 누르면 카메라가 열립니다. (`app/page.tsx`)
2. **축소** — 업로드 전에 브라우저에서 이미지를 줄여 전송량과 속도를 확보합니다. 첫 시도가 실패하면 더 작은 크기로 한 번 더 재시도합니다. (`lib/resizeImage.ts`)
3. **분석** — 서버 라우트가 Gemini에 이미지를 보내, 정해진 스키마(`readable / sender / message / action / important / speech`)로 구조화된 결과를 받습니다. (`app/api/analyze/route.ts`)
4. **낭독** — 결과의 `speech` 문장을 음성으로 읽어 줍니다. 서버에서 Gemini TTS로 자연스러운 음성을 생성하고, 실패하면 브라우저 내장 음성으로 자동 대체됩니다. (`app/api/tts/route.ts`, `lib/tts.ts`)

### 설계상 배려한 점

- **쉬운 말** — 분석 프롬프트가 "납부·지참" 같은 어려운 낱말을 "내야 해요·가져가야 해요"처럼 바꿔 말하도록 지시합니다. 설정에서 설명 난이도(`간단히`/`보통`)를 고를 수 있습니다.
- **끊기지 않는 음성** — 클라우드 TTS → 브라우저 음성으로 이어지는 폴백 구조라 앱이 침묵하지 않습니다. iOS 오디오 정책에 맞춰 사용자 탭 시점에 오디오를 미리 언락합니다.
- **중요 문서 안내** — 돈·병원·관공서·날짜 약속 등은 `important`로 표시해, 보호자에게 보여 달라는 안내를 덧붙입니다.
- **공유** — 결과를 보호자에게 문자/공유 시트로 바로 전달할 수 있습니다.

### 보호자 루프 (선택 기능)

당사자가 아무 버튼도 누르지 않아도 중요한 문서가 보호자에게 자동으로 전달되도록 하는 기능입니다. 관련 env가 설정되지 않으면 이 루프 전체가 조용히 비활성화되고, 앱은 기존 stateless 방식(공유 시트로 수동 전달)으로만 동작합니다.

```
분석 결과(important, senderKey) → 발신자 규칙 조회 → 사진을 Blob에 저장, 기록을 Redis에 저장
  → 알림 조건 충족 시 SMS(Solapi)로 /g/<token> 링크 발송
```

1. **자동 문자** — 분석 결과가 `important`이거나 그 발신자에게 "항상 알림" 규칙이 있으면, 보호자 전화번호로 `/g/<token>` 링크가 담긴 문자를 보냅니다(`lib/guardian/service.ts`, `lib/guardian/decide.ts`).
2. **보호자 열람** — 보호자는 `/g/[token]`에서 로그인 없이 문서 사진과 누가/내용/할 일 요약을 확인합니다. 사진은 private Vercel Blob에 저장되고, 토큰을 검증하는 프록시 라우트(`/api/guardian/image/[token]`)를 통해서만 내려갑니다.
3. **발신자 규칙** — 같은 화면에서 "이 발신자는 무시"(알림 억제) / "이 발신자는 항상 알림"(중요 여부와 무관하게 알림)을 등록할 수 있습니다(`app/g/[token]/page.tsx`, `app/g/RuleButtons.tsx`, `app/api/guardian/rule/route.ts`).
4. **최근 목록** — `/g?key=<GUARDIAN_ACCESS_KEY>`에서 최근 스캔 목록(시각·발신자·중요 여부·문자 발송 여부)을 확인할 수 있습니다(`app/g/page.tsx`).
5. **반복 감지** — 같은 발신자(`senderKey`)의 문서를 다시 찍으면 낭독에 "전에도 왔던 거예요" 안심 문장이 붙습니다.
6. **보호자 번호 등록** — 설정 화면에서 보호자(형) 전화번호를 1회 등록합니다(`app/components/SettingsScreen.tsx`, `app/api/guardian/phone/route.ts`).

필요한 환경 변수:

| 변수 | 용도 |
| --- | --- |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | 스캔 기록·발신자 규칙 저장(Upstash Redis) |
| `BLOB_READ_WRITE_TOKEN` | 문서 사진 저장(Vercel Blob, private) |
| `NEXT_PUBLIC_BASE_URL` | 문자에 넣을 `/g/<token>` 링크의 기준 URL |
| `GUARDIAN_ACCESS_KEY` | `/g` 최근 목록 접근 게이트 |
| `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER_PHONE` | SMS 발송(Solapi). 없으면 기록만 남고 문자는 보내지 않습니다 |

Redis·Blob 관련 env가 하나라도 없으면 보호자 루프는 전체 비활성화되며, 저장·알림 실패는 분석 결과 반환을 막지 않는 best-effort로 처리됩니다(`lib/guardian/adapters.ts`의 `getGuardian()`).

## 기술 스택

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Google Gemini** (`@google/genai`) — 이미지 분석 및 TTS
- **Upstash Redis** (`@upstash/redis`), **Vercel Blob** (`@vercel/blob`), **Solapi** (`solapi`) — 보호자 루프(선택, env 없으면 비활성)
- **Vitest** — 단위 테스트

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.local.example`를 복사해 `.env.local`을 만들고 Gemini API 키를 채웁니다.

```bash
cp .env.local.example .env.local
```

```bash
GEMINI_API_KEY=your-key-here

# 선택: TTS 음성/모델 변경
# GEMINI_TTS_VOICE=Kore     # Aoede, Leda, Puck, Charon, Zephyr, Fenrir …
# GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
```

이미지 분석과 TTS 모두 같은 `GEMINI_API_KEY` 하나만 있으면 됩니다. 보호자 루프는 선택 기능이며, 관련 env(위 "보호자 루프" 절 참고)를 채우지 않으면 자동으로 비활성화됩니다.

### 3. 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인합니다. 카메라 촬영은 실제 모바일 기기에서 테스트하는 것이 좋습니다.

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 |
| `npm run lint` | ESLint 검사 |
| `npm test` | 단위 테스트(Vitest) |

## 프로젝트 구조

```
app/
  page.tsx              화면 전환·촬영·분석·낭독을 잇는 메인 컨트롤러
  components/           HomeScreen, WaitScreen, ResultScreen, ErrorScreen, SettingsScreen, TopBar
  api/
    analyze/route.ts    이미지 → Gemini → 구조화된 문서 해석 (+ 보호자 루프 트리거)
    tts/route.ts        텍스트 → Gemini TTS → WAV 음성
    guardian/
      image/[token]/route.ts   토큰 검증 후 private Blob 이미지 프록시
      phone/route.ts           보호자 전화번호 조회·저장
      rule/route.ts            발신자 규칙(무시/항상 알림) 등록
  g/
    page.tsx             보호자용 최근 스캔 목록 (`?key=` 게이트)
    [token]/page.tsx      보호자용 문서 상세(사진·요약·규칙 버튼)
    RuleButtons.tsx        발신자 규칙 등록 클라이언트 컴포넌트
lib/
  tts.ts                음성 재생(클라우드 우선, 브라우저 폴백, iOS 언락)
  resizeImage.ts        업로드 전 이미지 축소
  useSettings.ts        설명 난이도·말하기 속도 설정
  types.ts              공유 타입
  guardian/
    types.ts             보호자 루프 타입(ScanRecord, GuardianDeps 등)
    decide.ts             알림 발송 여부 판정(순수 함수)
    service.ts             processScan — 기록 저장 + 알림 오케스트레이션
    token.ts               128bit 랜덤 capability 토큰 생성
    adapters.ts             Redis/Blob/Solapi 실어댑터 + env 게이트(getGuardian)
    memory.ts               테스트용 인메모리 어댑터
docs/                   설계 문서
```

## 배포

[Vercel](https://vercel.com/new)에 배포하는 것이 가장 간단합니다. 배포 환경에 `GEMINI_API_KEY`를 등록하면 됩니다. 보호자 루프까지 쓰려면 위 "보호자 루프" 절의 env(Upstash Redis, Vercel Blob, Solapi)를 함께 등록합니다. 등록하지 않아도 앱은 정상 동작합니다.
