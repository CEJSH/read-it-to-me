# Design: Convert `prototype.html` to a Next.js app

Date: 2026-07-17
Source: `~/Downloads/prototype.html` (a single-file HTML/CSS/JS prototype of "읽어줄게" — a camera-based document reader for a low-literacy adult, with a "guardian" settings screen and share-to-caregiver action)

## Context

The prototype is a fully working single-page app: point a phone camera at a document (mail, notice, bill), it's sent to Claude's vision API, and the response is read aloud via the Web Speech API in simple Korean. State is a hand-rolled 5-screen machine (`home → wait → result` or `error`, plus a `settings` overlay) toggled via `classList`.

The one piece that cannot be ported as-is: the prototype calls `https://api.anthropic.com/v1/messages` directly from the browser with **no API key** attached. That only works inside whatever sandboxed tool generated this prototype (which presumably injects/proxies the credential). A real deployment must not put an Anthropic API key in client-side JS.

## Decisions (confirmed with user)

- **Location**: `~/projects/read-it-to-me` (scaffolded already via `create-next-app`: Next.js 16.2.10, React 19.2.4, TypeScript, Tailwind CSS v4, App Router, ESLint, npm).
- **API key handling**: server-side Next.js Route Handler. The browser sends the resized image to `POST /api/analyze`; the route calls Anthropic's API using `ANTHROPIC_API_KEY` from `.env.local` (never shipped to the client).
- **Styling**: convert the prototype's hand-written CSS (custom properties + plain classes) to Tailwind utility classes. Tailwind v4 in this project is configured via `@theme` in `app/globals.css` (no `tailwind.config.js`), so the prototype's CSS variables (`--paper`, `--ink`, `--sub`, `--blue`, `--blue-dk`, `--green`, `--amber`, `--red`, `--card`, `--line`, `--radius`) become `@theme` tokens, and the `pulse`/`blink` keyframe animations become custom Tailwind utilities defined in the same file.
- **Model**: `claude-sonnet-5` (the prototype's `claude-sonnet-4-6` is not a real model id — almost certainly a prototyping-tool placeholder).
- **Language/tooling**: TypeScript, npm (both already set by the scaffold).

## Architecture

Single route (`/`), client-heavy — this app has no server-rendered data, no auth, no multi-page navigation, so a single `app/page.tsx` client component holding the screen-state machine is the right shape (matches the prototype's actual structure; inventing routes/pages for internal states would fight the design instead of porting it).

```
app/
  page.tsx                 — root client component: owns state (screen, settings, lastResult), wires callbacks to screens
  api/analyze/route.ts     — POST handler: receives {media, data} (base64 image), calls Anthropic Messages API server-side, returns parsed JSON
  components/
    TopBar.tsx              — brand + gear button (opens settings)
    HomeScreen.tsx           — the big camera button
    WaitScreen.tsx           — pulsing circle + "읽고 있어요…"
    ResultScreen.tsx         — speaking bar + 3 info cards + action buttons (replay/again/share)
    ErrorScreen.tsx          — error icon/message + retry button
    SettingsScreen.tsx       — rate/level segmented controls + save button
  globals.css               — @theme tokens + keyframes ported from the prototype's :root variables
lib/
  tts.ts                    — speak(), Korean voice selection, iOS unlock trick (ported near-verbatim from the prototype's TTS block)
  resizeImage.ts             — canvas-based resize-to-base64 helper (ported near-verbatim)
  useSettings.ts             — hook wrapping localStorage get/set for {rate, level}, replacing the prototype's `window.storage` stub
  types.ts                   — shared types: Settings, AnalyzeResult ({readable, sender, message, action, important, speech})
```

### State flow (unchanged from prototype, now in React)

`page.tsx` holds: `screen: 'home'|'wait'|'result'|'error'|'settings'`, `settings: {rate, level}` (persisted via `useSettings`), `lastResult: AnalyzeResult | null`, `errorMsg`.

1. User taps the camera button (`HomeScreen`) → hidden `<input type="file" accept="image/*" capture="environment">` opens → `onChange` fires.
2. `page.tsx`'s file handler: switch to `wait`, speak "읽고 있어요...", resize the image client-side (`lib/resizeImage.ts`), `POST /api/analyze` with `{media, data}`. On failure, retry once with a smaller/lower-quality resize (same fallback as the prototype). On final failure or `readable:false` in the response, switch to `error` and speak the error message.
3. On success: store as `lastResult`, switch to `result`, speak the full `speech` text (+ "이건 중요한 종이예요..." suffix if `important`).
4. `ResultScreen` renders the 3 cards (sender/message/action, each tap-to-replay via `speak()`), and replay/retake/share buttons — share uses `navigator.share` if available, else clipboard, exactly as the prototype does.
5. Gear icon → `settings`; segmented controls update `settings` state + call `speak()` for feedback on rate change; "저장하고 닫기" persists via `useSettings` and returns to `home`.

### `/api/analyze` route handler

- `export async function POST(request: Request)`, reads `{media, data}` JSON body (base64 payload + mime type, same shape the prototype already builds client-side — no reason to change the client/server contract).
- Builds the same Korean prompt (level-dependent, `simple` vs `normal`) and calls Anthropic's Messages API server-side via `@anthropic-ai/sdk` with `model: 'claude-sonnet-5'`, `ANTHROPIC_API_KEY` from env.
- Parses the model's JSON-ish text response the same way the prototype does (strip code fences, regex out the `{...}` block, `JSON.parse`), and returns it as `Response.json(...)`.
- On any failure (network, non-2xx, bad JSON), returns a non-200 `Response.json({error: ...}, {status: ...})`; the client's existing try/catch + retry-with-smaller-image logic handles it the same way the prototype's inline `fetch` did.

### Not changing

- The Korean prompts and copy, the retry-once-with-smaller-image behavior, the segmented settings controls, the share/clipboard fallback, the TTS sentence-splitting/playback logic, the `capture="environment"` file input trick.

## Testing

No existing test setup was scaffolded (create-next-app defaults don't include one, and the user didn't ask for one). Verification will be manual: `npm run dev`, exercise the flow in a browser (camera input can be substituted with a regular file picker on desktop), confirm TTS speaks, confirm the Tailwind conversion matches the prototype's visual design, confirm `/api/analyze` round-trips with a real `ANTHROPIC_API_KEY` in `.env.local`.
