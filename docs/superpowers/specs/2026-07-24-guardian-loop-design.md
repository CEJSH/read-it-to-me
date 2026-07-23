# 보호자 루프 (Guardian Loop) 설계

날짜: 2026-07-24
상태: 설계 승인, 구현 계획 대기

## 배경과 목표

읽어줄게의 타깃은 인지·발달 장애가 있는 특정 사용자 1명과 그를 돌보는 보호자("형") 1명이다. 범용 LLM 앱(Gemini/GPT)과의 차별점은 문서 해석 능력이 아니라 다음 세 가지다:

1. **보호자 루프** — 당사자가 아무 판단을 하지 않아도, 중요한 문서가 보호자에게 자동으로 전달된다.
2. **보호적 태도** — 중립적 요약이 아니라 사용자의 편에 서서 위험을 막는다.
3. **기억** — 반복 문서와 발신자를 기억해 "늘 있던 일"로 안심시키고, 보호자가 규칙을 학습시킬수록 그 사람 전용이 된다.

이 스펙은 위 1번과 3번을 구현 범위로 한다. (2번 사기 방어는 프롬프트 개선 수준으로 일부 반영, 본격 구현은 이후.)

**성공 기준**: important 문서를 찍었을 때 당사자가 어떤 버튼도 누르지 않고 보호자가 문자를 받고, 링크로 사진과 요약을 보고, 그 발신자에 대한 규칙을 등록할 수 있다. 같은 발신자의 반복 고지서를 찍으면 낭독에 "지난번과 같아요"류의 안심 문장이 붙는다.

## 사용자와 규모 전제

- 실사용자 2명(당사자 + 보호자). 멀티테넌트 아님.
- 따라서 회원가입/로그인은 만들지 않는다. 보호자는 추측 불가능한 토큰 링크로 접근한다.
- 보호자 전화번호는 당사자 앱 설정 화면에 1회 저장한다.

## 아키텍처

### 저장소

| 용도 | 선택 | 이유 |
| --- | --- | --- |
| 문서 사진 | Vercel Blob (private) | 보호자가 나중에 원본을 봐야 함 |
| 스캔 기록·발신자 규칙 | Upstash Redis (Vercel Marketplace KV) | 발신자별 조회, 최근 목록, 규칙 저장에 적합. 스키마 없는 소규모 데이터 |
| 문자 발송 | Solapi (국내 SMS API) | 서버에서만 호출. 어댑터로 감싸 교체 가능하게 |

### 데이터 모델 (Redis)

```
scan:{id}                # hash — 스캔 1건
  id, createdAt, senderKey, sender, message, action,
  important, speech, imageUrl(blob), notified(bool)

scans:recent             # list — 최근 스캔 id (최대 ~100개 유지)
sender:{senderKey}:scans # list — 발신자별 스캔 id (반복 감지용)
rule:{senderKey}         # hash — { mode: "ignore" | "always" }
guardian:phone           # string — 보호자 전화번호 (E.164)
view:{token}             # string — scan id (보호자 보기 토큰 → 스캔 매핑)
```

`senderKey`는 Gemini에게 스키마로 요청하는 발신자 안정 키다: 발신 기관의 정규화된 짧은 식별자(예: "국민건강보험공단", "서울대병원"). 같은 기관이면 같은 키가 나오도록 프롬프트에서 규칙을 명시한다. LLM 출력이라 완벽하지 않다는 점을 전제로, senderKey 매칭 실패는 기능 저하(반복 안심 문장이 안 붙음)일 뿐 오류가 아니다.

### 흐름

```
사진 → resize(클라이언트) → POST /api/analyze
  1. Gemini 분석 (기존 스키마 + senderKey 추가)
  2. rule:{senderKey} 조회
     - mode=ignore  → 알림 억제 (기록은 남김)
     - mode=always  → important 아니어도 알림
  3. sender:{senderKey}:scans 조회 → 과거 기록 있으면 repeat=true
  4. 기록 저장: 이미지 Blob 업로드 → scan:{id} 저장 → 목록 갱신
  5. 알림 조건 충족 시: view 토큰 생성 → SMS 발송 → notified=true
  6. 응답: AnalyzeResult + { repeat, notified }
```

- 클라이언트는 `repeat`이면 낭독 끝에 "전에도 왔던 거예요. 지난번과 같아요." 를 붙이고, `notified`면 "형한테 보냈어요."를 붙인다(기존 "형한테 보여 주세요" 대체).
- 저장/알림 실패는 **분석 결과 반환을 막지 않는다**. 당사자 경험(읽어주기)이 최우선이고 보호자 루프는 best-effort. 실패는 서버 로그로 남긴다.
- SMS 본문 예: `[읽어줄게] 동생에게 중요한 문서가 왔어요. 병원에서 온 편지 — https://…/g/abc123`

### 보호자 뷰 (신규 라우트)

- `GET /g/[token]` — 서버 컴포넌트. 토큰으로 스캔 조회 → 문서 사진, 누가/내용/할 일 요약, 촬영 시각 표시. 하단에 발신자 규칙 버튼 2개:
  - "이 발신자는 무시" → `rule:{senderKey} = ignore`
  - "이 발신자는 항상 알림" → `rule:{senderKey} = always`
  - (규칙이 이미 있으면 현재 상태 표시 + 해제 버튼)
- `GET /g` — 최근 스캔 목록(간단한 리스트: 시각·발신자·중요 여부·링크). 접근 게이트: `GUARDIAN_ACCESS_KEY` 환경변수와 일치하는 `?key=` 쿼리 필요. 보호자는 이 URL을 북마크한다.
- 규칙 변경은 `POST /api/guardian/rule` (토큰 검증 후 처리).

### 당사자 앱 변경

- `SettingsScreen`: "형 전화번호" 입력 필드 추가. 저장 시 `POST /api/guardian/phone`으로 서버(Redis)에 저장. 번호가 없으면 알림 단계는 조용히 건너뜀.
- `ResultScreen`: `notified`면 "형한테 보냈어요 ✓" 뱃지 표시. 수동 공유 버튼은 비중요 문서용으로 유지.
- 그 외 화면 구조·낭독 파이프라인(`lib/tts.ts`)은 변경 없음.

## 보안·프라이버시 트레이드오프 (인지하고 수용)

- `/g/[token]`은 로그인 없는 capability URL이다. 링크를 아는 사람은 해당 문서 1건을 볼 수 있다. 토큰은 128bit 랜덤(URL-safe). 실사용 2명 규모에서 수용, 추후 PIN 게이트 추가 여지.
- `/g` 목록은 정적 키(`GUARDIAN_ACCESS_KEY`) 게이트. 같은 성격의 수용.
- 문서 사진에는 개인정보가 포함된다. Blob은 private로 저장하고, 토큰 게이트 프록시 라우트(`/api/guardian/image/[token]`)를 거쳐서만 서빙한다.
- SMS 발송 번호·API 키는 서버 환경변수로만 관리.
- `/api/guardian/phone`: GET은 번호 대신 등록 여부(hasPhone)만 반환한다. POST는 무인증이다 — 배포 URL이 비공개(문자 링크로만 공유)이고 실사용 2명 규모라는 전제에서 수용. URL이 공개되면 알림 채널 탈취가 가능하므로 그때는 게이트(예: GUARDIAN_ACCESS_KEY) 추가가 필요하다.

## 환경변수 (추가)

```
BLOB_READ_WRITE_TOKEN=      # Vercel Blob
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
SOLAPI_API_KEY=
SOLAPI_API_SECRET=
SOLAPI_SENDER_PHONE=        # 발신 번호 (사전 등록 필요)
GUARDIAN_ACCESS_KEY=        # /g 목록 접근 키
NEXT_PUBLIC_BASE_URL=       # SMS 링크 생성용
```

## 에러 처리 원칙

- 분석 성공 + 부가 기능(저장·알림) 실패 → 분석 결과는 정상 반환, `notified: false`. 당사자에게 오류를 보이지 않는다.
- SMS 발송 실패 → 서버 로그. 클라이언트는 기존 "형한테 보여 주세요" 낭독으로 폴백(notified=false이므로 자연스럽게 기존 문구가 나감).
- Redis/Blob 미설정(환경변수 없음) → 보호자 루프 전체를 비활성화하고 기존 stateless 동작과 동일하게 작동. 로컬 개발이 무거워지지 않게 하는 장치.

## 테스트 방침

- `senderKey` 정규화·규칙 판정·알림 조건(important/always/ignore 조합)은 순수 함수로 분리해 단위 테스트.
- SMS·Blob·Redis는 어댑터 인터페이스로 감싸고 테스트에서는 인메모리 구현으로 대체.
- 실기기 수동 테스트 시나리오: (1) important 문서 → 문자 수신 → 링크 열람, (2) 같은 고지서 2회 촬영 → 반복 안심 문장, (3) 무시 규칙 등록 후 재촬영 → 알림 없음.

## 범위에서 제외 (YAGNI)

- 멀티유저/회원가입, 카카오 알림톡·이메일 채널, 풀 대시보드(통계·검색), "AI가 애매하면 보호자에게 질문" 에스컬레이션(v2), 사기 탐지 전용 모델링(프롬프트 수준만), 푸시 알림.
