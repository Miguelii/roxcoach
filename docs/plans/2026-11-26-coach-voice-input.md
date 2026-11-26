# Coach Voice Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A microphone button in the coach composer that records the athlete, transcribes the clip on the server with Gemini and appends the text to the message box without sending it.

**Architecture:** The browser records with `MediaRecorder` (hook `useVoiceRecorder`, browser APIs injected) and posts the clip as multipart to a new self-authenticating route `POST /api/coach/transcribe`. The route delegates to a testable handler (`createTranscribeHandler`, same shape as `createUploadHandler`) that validates the clip and calls an injected transcriber. The transcriber calls `gemini-3.5-transcribe` through the Interactions API with plain `fetch`, or `gemini-3.1-flash-lite` through `@ai-sdk/google` if the smoke test rules the first one out.

**Tech Stack:** Next.js route handler, React 19 + react-hook-form, `MediaRecorder` / `getUserMedia`, Gemini Interactions API (`fetch`), `@ai-sdk/google` (plan B only), vitest via `pnpm test`.

**Spec:** `docs/tech-specs/2026-11-26-coach-voice-input-design.md`

## Global Constraints

- English everywhere (code, copy, docs). No em-dashes anywhere. `@/` imports only. `type Props` for components. `cn()` and semantic tokens only. Types at the top of the file.
- No comments that restate code. Comment only business rules and workarounds.
- Tests locate elements by `data-testid` only. No module mocks: pass fakes as dependencies.
- `NEXT_GEMINI_API_KEY` is read only in the route file, through `ServerEnv`. No new env variable.
- The audio and the transcript never reach logs or error bodies. Logs carry only a tag and a status.
- No new dependency.
- Recording limit: **60 seconds** (auto stop). Upload cap: **2 MB**. Transcribe model id: `gemini-3.5-transcribe`, `mode: "smart"`, no `language_codes`. Plan B model id: `gemini-3.1-flash-lite`.
- Allowed MIME base types (parameters after `;` stripped): `audio/webm`, `audio/mp4`, `audio/ogg`, `audio/mpeg`, `audio/wav`.
- UI copy, verbatim: mic blocked `Allow microphone access in your browser settings`, nothing heard `Didn't catch that. Try again.`, busy `Transcription is busy. Try again in a minute.`, other `Couldn't transcribe. Try again.`
- Every commit passes `pnpm fmt`, `pnpm check`, `pnpm knip`; run `pnpm test` before each commit.

## Review Focus

- The athlete closes the coach panel while recording: the mic tracks stop (the browser's recording indicator goes away) and nothing is uploaded or written. The panel stays mounted when closed, so this needs an explicit cancel. Test in Task 4 and Task 5.
- The athlete types while the transcription is in flight: the transcript is appended to the text as it is when the result arrives, not to a snapshot from when recording started. Test in Task 5.
- Taps while transcribing, or a fast double tap: ignored, exactly one request. Test in Task 4.
- Safari reports `audio/mp4;codecs=mp4a.40.2` (and Chrome `audio/webm;codecs=opus`): accepted by the handler. Test in Task 3.
- A stop right after start gives an empty clip: no request is made and the athlete sees the "nothing heard" line. Test in Task 4.

---

### Task 1: Smoke script and the verdict on `gemini-3.5-transcribe`

Decides the request and response shape for Task 2, or switches to plan B. Needs the athlete to run it.

**Files:**

- Create: `tools/gemini-transcribe-smoke.ts`
- Test: `tools/__tests__/gemini-transcribe-smoke.test.ts`
- Modify: `docs/tech-specs/2026-11-26-coach-voice-input-design.md` (section "What is not verified yet")

**Interfaces:**

- Produces (for Task 2): the confirmed request body, the path to the text in the response, and the MIME type to send for Safari clips, written into the spec.

- [ ] **Step 1: Write the failing tests** with a fake `fetch`, following `tools/__tests__/gemini-smoke.test.ts`:
    - `runTranscribeSmoke({ apiKey: undefined, ... })` resolves `{ status: 'no-key' }` and never calls fetch.
    - With a fake fetch answering 200, it POSTs to `https://generativelanguage.googleapis.com/v1beta/interactions` with header `x-goog-api-key`, body `model: 'gemini-3.5-transcribe'`, `generation_config.transcription_config.mode === 'smart'`, and one input part `{ type: 'audio', data: <base64 of the bytes>, mime_type: <given> }`; resolves `{ ok: true, body: <parsed JSON> }`.
    - A non-2xx answer resolves `{ status: <number>, body: <text> }`; a rejected fetch resolves `{ status: 'network' }`.

- [ ] **Step 2: Run** `pnpm test tools/__tests__/gemini-transcribe-smoke.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `runTranscribeSmoke(options: { apiKey: string | undefined; bytes: Uint8Array; mimeType: string; fetch?: typeof fetch })` and a `main()` that loads env with `loadEnvConfig` (like `gemini-smoke.ts`), reads the file path from `argv[2]`, infers the MIME from the extension (`.webm` `audio/webm`, `.m4a`/`.mp4` `audio/mp4`, `.mp3` `audio/mpeg`, `.wav` `audio/wav`, `.ogg` `audio/ogg`) unless `argv[3]` overrides it, and prints the status plus the JSON body pretty printed. Printing the body is fine here: it is the athlete's own test clip. Never print the key. Header comment states the run command: `pnpm dlx tsx tools/gemini-transcribe-smoke.ts <file> [mime]`.

- [ ] **Step 4: Run** the test file again. Expected: PASS.

- [ ] **Step 5: Checkpoint with the athlete.** Ask them to record a short Portuguese clip on Chrome (webm) and on the iPhone (Voice Memos exports `.m4a`, which is the same container Safari's `MediaRecorder` produces) and run the script on each, also once with `audio/m4a` as the MIME override for the iPhone clip. Stop here until they paste the output.

- [ ] **Step 6: Record the verdict in the spec.** One of:
    - Inline works for both: write the exact request part shape, the JSON path of the transcript, and the MIME to send for Safari clips.
    - Inline rejected but a Files API upload works (extend the script to try it): write the upload request and the transcribe request; Task 2 then makes two calls per clip.
    - Model unavailable on the free tier or formats rejected: write "Plan B: `gemini-3.1-flash-lite`" and the reason.

- [ ] **Step 7: Commit**

```bash
git add tools/gemini-transcribe-smoke.ts tools/__tests__/gemini-transcribe-smoke.test.ts docs/tech-specs/2026-11-26-coach-voice-input-design.md
git commit -m "feat(coach): add the transcription smoke script and record its verdict"
```

### Task 2: Transcriber provider

**Files:**

- Create: `src/_bff/modules/coach/providers/transcriber.ts` (types), `src/_bff/modules/coach/providers/gemini-transcriber.ts`
- Modify: `src/_bff/modules/coach/constants/index.ts`
- Test: `src/_bff/modules/coach/providers/__tests__/gemini-transcriber.test.ts`

**Interfaces:**

- Consumes: the verdict from Task 1.
- Produces:

```ts
// providers/transcriber.ts
export type TranscribeInput = { bytes: Uint8Array; mimeType: string }
export type TranscribeOutcome =
    | { ok: true; text: string }
    | { ok: false; kind: 'rate_limited' | 'unavailable' }
export type Transcriber = (input: TranscribeInput, signal: AbortSignal) => Promise<TranscribeOutcome>

// providers/gemini-transcriber.ts
export const createGeminiTranscriber: (options: {
    apiKey: string
    timeoutMs: number
    fetch?: typeof fetch
}) => Transcriber

// constants/index.ts
export const TRANSCRIBE_MODEL_ID = 'gemini-3.5-transcribe' // or 'gemini-3.1-flash-lite' on plan B
export const TRANSCRIBE_TIMEOUT_MS = 30_000
export const AUDIO_MAX_BYTES = 2 * 1024 * 1024
export const AUDIO_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav'] as const
```

- [ ] **Step 1: Write the failing tests** with a fake `fetch`:
    - Sends the request shape recorded in Task 1 (model, smart mode, base64 audio, the Safari MIME mapping) to the Interactions endpoint with the key header.
    - 200 with a transcript resolves `{ ok: true, text }` with the text trimmed; 200 with no transcript resolves `{ ok: true, text: '' }`.
    - 429 resolves `{ ok: false, kind: 'rate_limited' }`; 500, a malformed body and a rejected fetch resolve `{ ok: false, kind: 'unavailable' }`.
    - The timeout aborts the fetch and resolves `unavailable` (fake timers); an abort of the passed signal aborts the fetch.

    On plan B, the same tests with an injected `generate` (default `generateText` from `ai`) instead of `fetch`, mirroring `gemini-coach-model.ts`: a user message with a file part (`mediaType` the clip's MIME) and the instruction `Transcribe this audio exactly as spoken, in the language spoken. Reply with the transcript only, or nothing if there is no speech.`; status read with the same `findStatusCode` approach.

- [ ] **Step 2: Run** `pnpm test src/_bff/modules/coach/providers/__tests__/gemini-transcriber.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `createGeminiTranscriber`. Parse the response with a zod schema (no casts). Combine the timeout and the caller's signal with `AbortSignal.any`.

- [ ] **Step 4: Run** the test file. Expected: PASS.

- [ ] **Step 5: Commit** `feat(coach): add the Gemini transcriber`.

### Task 3: Transcribe handler and route

**Files:**

- Create: `src/_bff/modules/coach/helpers/transcribe-handler.helper.ts`, `src/app/api/coach/transcribe/route.ts`
- Test: `src/_bff/modules/coach/helpers/__tests__/transcribe-handler.helper.test.ts`
- Modify: `docs/tech-specs/architecture.md` (route table near line 150), `docs/tech-specs/coach-chat.md` ("Route and security": add the transcribe route)

**Interfaces:**

- Consumes: `Transcriber`, `AUDIO_MAX_BYTES`, `AUDIO_MIME_TYPES`, `createGeminiTranscriber`, `TRANSCRIBE_TIMEOUT_MS` from Task 2.
- Produces: `POST /api/coach/transcribe`, multipart field `audio`; `200 { text: string }`; errors `{ error: string }`.

```ts
export const createTranscribeHandler: (deps: {
    getUser: () => Promise<User | null>
    isConfigured: boolean
    transcribe: Transcriber
}) => (request: Request) => Promise<Response>
```

- [ ] **Step 1: Write the failing tests** (fake `getUser`, fake `transcribe`, `Request` with `FormData`, same style as `upload-handler.helper.test.ts`):

| Case                                          | Status | Body `error`                                    |
| --------------------------------------------- | ------ | ----------------------------------------------- |
| `getUser` throws                              | 500    | `Something went wrong. Try again.`              |
| no user                                       | 401    | `Sign in to use voice input`                    |
| no access flag                                | 403    | `You do not have access`                        |
| not configured                                | 503    | `Voice input is not available right now`        |
| content-length missing or over 2 MB + 64 KB   | 413    | `The recording is too long`                     |
| no `audio` file, or empty file                | 422    | `Record something first`                        |
| file over 2 MB                                | 413    | `The recording is too long`                     |
| MIME not allowed (`audio/flac`, `video/webm`) | 415    | `This recording format is not supported`        |
| transcriber `rate_limited`                    | 429    | `Transcription is busy. Try again in a minute.` |
| transcriber `unavailable`                     | 502    | `Couldn't transcribe. Try again.`               |
| transcriber throws                            | 500    | `Something went wrong. Try again.`              |

Plus: `audio/webm;codecs=opus` and `audio/mp4;codecs=mp4a.40.2` reach the transcriber with the bytes and the MIME as sent, and answer `200 { text }`; the request signal is passed to the transcriber; the transcriber is never called on any rejected case.

- [ ] **Step 2: Run** the test file. Expected: FAIL.

- [ ] **Step 3: Implement** the handler (logs prefix `coachTranscribe`, tag only) and the route: `maxDuration = 60`, `getUser` wired exactly like `src/app/api/coach/chat/route.ts`, transcriber built from `ServerEnv.NEXT_GEMINI_API_KEY` or `isConfigured: false` without a key.

- [ ] **Step 4: Run** the test file. Expected: PASS. Update the two spec route lists.

- [ ] **Step 5: Commit** `feat(coach): add the transcribe route`.

### Task 4: `useVoiceRecorder` hook

**Files:**

- Create: `src/modules/coach/use-voice-recorder.ts`
- Modify: `src/modules/coach/constants.ts`
- Test: `src/modules/coach/__tests__/use-voice-recorder.test.ts`

**Interfaces:**

- Produces:

```ts
export type VoiceRecorderLike = {
    mimeType: string
    start: () => void
    stop: () => void
    onData: (listener: (chunk: Blob) => void) => void
    onStop: (listener: () => void) => void
}
export type VoiceDeps = {
    getStream: (() => Promise<MediaStream>) | null // null when the browser cannot record
    createRecorder: (stream: MediaStream) => VoiceRecorderLike
    transcribe: (audio: Blob, signal: AbortSignal) => Promise<Response>
}
export type VoiceState = 'idle' | 'recording' | 'transcribing'
export type VoiceErrorKind = 'mic-blocked' | 'no-speech' | 'busy' | 'failed'

export const browserVoiceDeps: () => VoiceDeps // wraps MediaRecorder; transcribe POSTs FormData `audio` to /api/coach/transcribe

export function useVoiceRecorder(options: { deps?: VoiceDeps; onTranscript: (text: string) => void }): {
    supported: boolean
    state: VoiceState
    seconds: number
    error: VoiceErrorKind | null
    toggle: () => void
    cancel: () => void
}

// constants.ts
export const VOICE_MAX_SECONDS = 60
```

- [ ] **Step 1: Write the failing tests** with `renderHook`, a fake recorder and fake stream tracks (`stop` spies), fake timers:
    - `supported` is false when `getStream` is null, and `toggle` does nothing.
    - toggle, then toggle again: `recording` then `transcribing`, posts one Blob with the recorder's MIME, then `onTranscript('hello')` for `200 { text: 'hello' }` and back to `idle`; every track was stopped.
    - `seconds` counts up each second while recording; at 60 the recording stops on its own and is transcribed.
    - `getStream` rejecting with `NotAllowedError` sets `error: 'mic-blocked'`.
    - An empty clip makes no request and sets `'no-speech'`; `200 { text: '  ' }` sets `'no-speech'` and never calls `onTranscript`.
    - 429 sets `'busy'`; any other status or a rejected request sets `'failed'`.
    - `toggle` while `transcribing` makes no second request; two toggles before `getStream` resolves still record once.
    - `cancel()` while recording stops the tracks, makes no request and returns to `idle`; `cancel()` while transcribing aborts the request and `onTranscript` is never called; unmount does the same.
    - Starting a new recording clears the previous error.

- [ ] **Step 2: Run** the test file. Expected: FAIL.

- [ ] **Step 3: Implement** the hook and `browserVoiceDeps` (support check: `navigator.mediaDevices?.getUserMedia` and `typeof MediaRecorder !== 'undefined'`; `MediaRecorder` with no `mimeType` option so each browser uses its default).

- [ ] **Step 4: Run** the test file. Expected: PASS.

- [ ] **Step 5: Commit** `feat(coach): add the voice recorder hook`.

### Task 5: Mic button in the composer

**Files:**

- Create: `src/modules/coach/coach-voice-button.tsx`
- Modify: `src/modules/coach/coach-chat-view.tsx` (composer, around lines 220 and 355 to 420), `src/modules/coach/use-coach-composer.ts`, `src/modules/coach/coach-chat.tsx` (nothing to pass if the view defaults to `browserVoiceDeps`), `docs/tech-specs/coach-chat.md` (drop "No voice input" from non-goals, add a "Voice input" subsection under "UI" pointing to the design doc), `docs/tech-specs/2026-11-26-coach-voice-input-design.md` (Status: implemented)
- Test: `src/modules/coach/__tests__/coach-chat-view.test.tsx`

**Interfaces:**

- Consumes: `useVoiceRecorder`, `VoiceDeps`, `VOICE_MAX_SECONDS` from Task 4.
- Produces: `CoachChatView` gains `voiceDeps?: VoiceDeps` (defaults to `browserVoiceDeps()`); `useCoachComposer` returns `appendText(text: string): void`, which joins the current field value and the text with one space (no leading space when empty) and sets it with `shouldValidate: true`, then focuses the textarea.

- [ ] **Step 1: Write the failing tests** in the view suite (pass fake `voiceDeps` through the harness):
    - `coach-voice` is absent when `getStream` is null.
    - Idle shows `coach-voice` with `aria-label="Record a voice message"`; recording shows `coach-voice-timer` with `0:03` after 3 s and `aria-label="Stop recording"`; transcribing disables the button.
    - With `Plan for` typed, a transcript `tomorrow's run` leaves `coach-input` as `Plan for tomorrow's run` and nothing is sent.
    - Text typed while transcribing (`Hi` typed after stop) ends as `Hi <transcript>`.
    - Each error kind shows the verbatim copy from Global Constraints in `coach-voice-error`.
    - Closing the panel while recording stops the tracks and no request is made.
    - The button works while the coach is streaming.

- [ ] **Step 2: Run** `pnpm test src/modules/coach/__tests__/coach-chat-view.test.tsx`. Expected: new cases FAIL.

- [ ] **Step 3: Implement** `CoachVoiceButton` (`type Props = { voice: ReturnType<typeof useVoiceRecorder> }`, lucide `MicIcon` / `SquareIcon` / `Loader2Icon`, a pulsing `bg-destructive` dot and `m:ss` timer while recording, `size="icon" variant="outline"`), place it before Send, render the error line under the textarea next to `coach-input-error`, and call `voice.cancel()` when `open` becomes false.

- [ ] **Step 4: Run** the view suite. Expected: PASS.

- [ ] **Step 5: Full verification:** `pnpm test`, `pnpm fmt`, `pnpm check`, `pnpm knip`. Expected: all green.

- [ ] **Step 6: Commit** `feat(coach): add voice input to the coach composer`.

- [ ] **Step 7: Manual check by the athlete** (not automatable): on the iPhone home screen PWA and on desktop Chrome, record a Portuguese question with a Hyrox term, check the text and punctuation. Record what fails in the spec's "Left out".
