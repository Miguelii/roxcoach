# Coach Voice Input Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The coach mic writes the transcript into the message box while the athlete speaks, using `gemini-3.5-transcribe-live`, and falls back to the existing upload route when the live path fails.

**Architecture:** A new self-authenticating route issues a one-use ephemeral token locked to the live model and config. The browser captures the mic with an `AudioWorklet`, downsamples to 16 kHz PCM16 on the main thread, streams 100 ms chunks over a WebSocket straight to Google, and shows partial then final text in the box. Every chunk is also kept; on any live failure the chunks become a WAV posted to `POST /api/coach/transcribe`.

**Tech Stack:** Next.js route handlers, React 19 + react-hook-form, Web Audio (`AudioContext`, `AudioWorklet`), browser `WebSocket`, Gemini Live API, vitest via `pnpm test`.

**Spec:** `docs/tech-specs/2026-11-26-coach-voice-input-design.md`, section "Live transcription (v2)".

## Global Constraints

- Everything in the v1 plan's Global Constraints still holds (`docs/plans/2026-11-26-coach-voice-input.md`): English, no em-dashes, `@/` imports, `type Props`, test ids only, no module mocks, key read only in route files, no audio, transcript or token in logs, no new dependency, the four error copies, 60 s cap.
- Live model id `gemini-3.5-transcribe-live`. Setup config, verbatim: `generationConfig: { responseModalities: ['TEXT'] }`, `inputAudioTranscription: { languageCodes: [], mode: 'SMART' }`.
- Token: `uses: 1`, `newSessionExpireTime` now + 60 s, `expireTime` now + 180 s, `liveConnectConstraints` locking the model and that config.
- Audio: PCM16, 16000 Hz, mono, little-endian, 1600 samples (100 ms) per chunk, `mimeType: 'audio/pcm;rate=16000'`.
- Stop waits at most 3000 ms for the final text.
- The textarea is read only while the mic is recording or finishing.
- Decisions carried from the v1 final review (ledger "Final:" lines): opening the mic or audio graph can fail after permission, which must release everything and show `failed`; a tap while the mic permission is still pending cancels that attempt and starts a new one; the 60 s cap uses wall-clock time, not tick counts; the stop-recording icon must differ from the reply Stop button.

## Review Focus

- The athlete closes the panel while live text is showing: socket closed, mic and `AudioContext` released, box back to the text typed before recording. Test in Task 5 and Task 6.
- The socket drops after partial text and before any final text: the fallback runs and its text replaces the partial; if the fallback also fails, the partial text stays in the box with the `failed` line (losing visible words would be worse). Test in Task 5.
- The final text never arrives within 3 s but partials did: the last partial is kept as the result, no fallback (a second transcription would only add delay). Test in Task 5.
- iOS creates the `AudioContext` suspended unless it is made and resumed inside the tap: `openAudio` must be called synchronously from `toggle`. Test in Task 5 (the fake records whether it was called before the first await).
- A chunk sent before `setupComplete` is lost by the server: chunks are queued until then and flushed in order. Test in Task 4.

---

### Task 1: Shared live config and smoke script

**Files:**

- Create: `src/_bff/core/constants/transcribe-live.constants.ts`, `tools/gemini-live-smoke.ts`
- Test: `tools/__tests__/gemini-live-smoke.test.ts`, `src/_bff/core/constants/__tests__/transcribe-live.constants.test.ts`
- Modify: the spec ("Not verified yet" under v2, and v1's "What is not verified yet": record that the athlete confirmed v1 end to end in the browser on 2026-11-26)

**Interfaces:**

- Produces (frontend and `_bff` both import it, so it lives in `src/_bff/core/` and stays client safe):

```ts
export const TRANSCRIBE_LIVE_MODEL_ID = 'gemini-3.5-transcribe-live'
export const LIVE_SOCKET_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
export const LIVE_SAMPLE_RATE = 16_000
export const LIVE_CHUNK_SAMPLES = 1600
export const LIVE_TRANSCRIBE_CONFIG: { generationConfig: {...}; inputAudioTranscription: {...} } // values from Global Constraints
export function liveSetupMessage(): { setup: { model: string } & typeof LIVE_TRANSCRIBE_CONFIG } // model is `models/${TRANSCRIBE_LIVE_MODEL_ID}`
export function liveSocketUrl(token: string): string // LIVE_SOCKET_URL + '?access_token=' + encodeURIComponent(token)
```

- [ ] **Step 1: Failing tests.** Constants: `liveSetupMessage()` equals the verbatim setup from the spec; `liveSocketUrl('a b')` ends with `?access_token=a%20b`. Smoke: `createLiveToken({ apiKey: undefined })` returns `{ status: 'no-key' }` without fetch; with a fake fetch it POSTs `https://generativelanguage.googleapis.com/v1beta/auth_tokens` with `x-goog-api-key`, `uses: 1`, both expire times as ISO strings 60 s and 180 s after an injected `now`, and `liveConnectConstraints: { model: TRANSCRIBE_LIVE_MODEL_ID, config: LIVE_TRANSCRIBE_CONFIG }`; returns `{ ok: true, body }` or `{ status, body }`. `pcmChunksFromWav(bytes)` skips a 44 byte header and splits into 3200 byte chunks (last one shorter).
- [ ] **Step 2: Run** both test files. Expected: FAIL.
- [ ] **Step 3: Implement.** `main()` (`pnpm dlx tsx tools/gemini-live-smoke.ts <16 kHz mono wav>`): create the token, print the response with any string longer than 20 characters redacted to its first 6, read the token from `name` (or print the keys and stop if absent), open the global `WebSocket` with `liveSocketUrl`, send the setup, wait for `setupComplete`, send the chunks 100 ms apart, then `audioStreamEnd`, print every message, exit 10 s after the last chunk.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Checkpoint.** Ask the athlete to run it on `.superpowers/sdd/2026-11-26-coach-voice-input/sample.wav` and paste the output. Record in the spec: the token field, whether `mode: 'SMART'` in the constraints was accepted, whether partial and final messages arrived and their exact shape. If the token is rejected with the constraints, retry the script without `config` in the constraints and record which form works; Task 2 uses that form.
- [ ] **Step 6: Commit** `feat(coach): add the live transcription config and smoke script`.

### Task 2: Token route, and failure reasons in the v1 transcriber

**Files:**

- Create: `src/_bff/modules/coach/providers/gemini-live-token.ts`, `src/_bff/modules/coach/helpers/transcribe-token-handler.helper.ts`, `src/app/api/coach/transcribe/token/route.ts`
- Modify: `src/_bff/modules/coach/providers/transcriber.ts`, `src/_bff/modules/coach/providers/gemini-transcriber.ts`, `src/_bff/modules/coach/helpers/transcribe-handler.helper.ts`, `docs/tech-specs/architecture.md` (route table), `docs/tech-specs/coach-chat.md` (route paragraph)
- Test: `src/_bff/modules/coach/providers/__tests__/gemini-live-token.test.ts`, `src/_bff/modules/coach/helpers/__tests__/transcribe-token-handler.helper.test.ts`, the existing transcriber and handler tests

**Interfaces:**

- Consumes: `TRANSCRIBE_LIVE_MODEL_ID`, `LIVE_TRANSCRIBE_CONFIG` (Task 1), the token field recorded in Task 1.
- Produces:

```ts
// gemini-live-token.ts
export type LiveTokenOutcome = { ok: true; token: string } | { ok: false; kind: 'rate_limited' | 'unavailable'; reason: string }
export const createLiveTokenIssuer: (options: { apiKey: string; fetch?: typeof fetch; now?: () => Date }) => () => Promise<LiveTokenOutcome>
// transcribe-token-handler.helper.ts
export const createTranscribeTokenHandler: (deps: { getUser: () => Promise<User | null>; isConfigured: boolean; issueToken: () => Promise<LiveTokenOutcome> }) => (request: Request) => Promise<Response>
// transcriber.ts, changed
export type TranscribeOutcome = { ok: true; text: string } | { ok: false; kind: 'rate_limited' | 'unavailable'; reason: string }
```

`POST /api/coach/transcribe/token` answers `200 { token }`, `Cache-Control: no-store`.

- [ ] **Step 1: Failing tests.** Issuer: request body as in Task 1's `createLiveToken` (shared through a builder, not copied); 200 with the token field returns `{ ok: true, token }`; 429 `rate_limited`; other statuses `unavailable` with `reason` the status number as a string; missing field `reason: 'parse'`; rejected fetch `reason: 'network'`. Handler: same auth rows and copy as the v1 handler table with `Sign in to use voice input` / `Voice input is not available right now`, `429 Transcription is busy. Try again in a minute.`, `502 Couldn't transcribe. Try again.`, issuer throws `500`; success body `{ token }` and `no-store`; no error body contains the issuer's `reason`. v1 transcriber: only `status === 'completed'` is success; a completed interaction with no text parts returns `{ ok: false, kind: 'unavailable', reason: 'no_text_parts' }`; reasons `'timeout'`, `'parse'`, `'failed'`, `'network'`, `'<status>'`; the v1 handler logs `{ tag: kind, reason }`.
- [ ] **Step 2: Run** the four test files. Expected: new cases FAIL.
- [ ] **Step 3: Implement.** Route wired like `src/app/api/coach/transcribe/route.ts`.
- [ ] **Step 4: Run** the four test files. Expected: PASS. Update the two spec route lists.
- [ ] **Step 5: Commit** `feat(coach): add the live transcription token route`.

### Task 3: PCM helpers and the capture worklet

**Files:**

- Create: `src/modules/coach/pcm-audio.ts`, `src/modules/coach/pcm-worklet.ts`
- Test: `src/modules/coach/__tests__/pcm-audio.test.ts`

**Interfaces:**

- Consumes: `LIVE_SAMPLE_RATE`, `LIVE_CHUNK_SAMPLES` (Task 1).
- Produces:

```ts
export function downsample(input: Float32Array, inputRate: number, outputRate?: number): Float32Array // default LIVE_SAMPLE_RATE
export function toPcm16(samples: Float32Array): Int16Array // clamps to [-1, 1], -1 -> -32768, 1 -> 32767
export function pcmToBase64(pcm: Int16Array): string // little-endian bytes
export function encodeWav(chunks: Int16Array[], sampleRate?: number): Blob // type 'audio/wav', 44 byte PCM header
export function createChunker(onChunk: (chunk: Int16Array) => void): { push: (pcm: Int16Array) => void; flush: () => void } // emits exactly LIVE_CHUNK_SAMPLES, flush emits the remainder
// pcm-worklet.ts
export const PCM_WORKLET_NAME = 'coach-pcm-capture'
export const PCM_WORKLET_SOURCE: string // registers a processor that posts each input block's first channel (Float32Array copy) to the port
```

- [ ] **Step 1: Failing tests.** `downsample` of 48 kHz to 16 kHz keeps one third of the length and averages each window (`[0.3, 0.3, 0.3, 0.6, 0.6, 0.6]` gives `[0.3, 0.6]`); same rate returns an equal array; 44.1 kHz length rounds down. `toPcm16([1.5, -2, 0, 0.5])` equals `[32767, -32768, 0, 16384]`. `pcmToBase64(Int16Array.of(1, -1))` equals `AQD//w==`. `encodeWav` of two chunks of 2 samples gives 52 bytes, `RIFF`/`WAVE`/`fmt `/`data` markers, sample rate 16000, byte rate 32000, data length 8. Chunker: pushing 1000 then 1000 samples emits one 1600 chunk; `flush` emits the 400 remainder; nothing emitted for an empty flush.
- [ ] **Step 2: Run** `pnpm test src/modules/coach/__tests__/pcm-audio.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The worklet source is a plain JS string (it runs in the audio thread, not through the bundler), loaded later through a `Blob` URL.
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(coach): add PCM audio helpers and the capture worklet`.

### Task 4: Live transcription session

**Files:**

- Create: `src/modules/coach/live-transcription.ts`
- Test: `src/modules/coach/__tests__/live-transcription.test.ts`

**Interfaces:**

- Consumes: `liveSetupMessage`, `liveSocketUrl` (Task 1), `pcmToBase64` (Task 3).
- Produces:

```ts
export type LiveSocket = {
    send: (data: string) => void
    close: () => void
    onOpen: (listener: () => void) => void
    onMessage: (listener: (data: string) => void) => void
    onClose: (listener: (clean: boolean) => void) => void // clean false on error or abnormal close
}
export type LiveSession = {
    sendChunk: (chunk: Int16Array) => void
    finish: () => Promise<LiveResult> // sends audioStreamEnd, resolves on the final text or after FINAL_WAIT_MS
    close: () => void
}
export type LiveResult = { ok: true; text: string } | { ok: false }
export const FINAL_WAIT_MS = 3000
export function openLiveSession(options: {
    token: string
    openSocket: (url: string) => LiveSocket
    onText: (text: string) => void
    onFailure: () => void
}): LiveSession
```

- [ ] **Step 1: Failing tests** with a fake socket (records sent JSON, lets the test fire open, message, close) and fake timers:
    - Opens `liveSocketUrl(token)`; on open sends exactly `liveSetupMessage()` first.
    - Chunks sent before `{ "setupComplete": {} }` are queued and flushed in order after it, as `realtimeInput.audio` with `mimeType: 'audio/pcm;rate=16000'` and the base64 data.
    - `onText` gets final + partial: final `Amanhã tenho` then partial `treino` gives `Amanhã tenho treino`; a new final replaces both (SMART final is cumulative); text is trimmed and joined with one space.
    - Messages whose data is a non-JSON string or a Blob-like are ignored (the server may send binary frames; `openSocket` adapters pass only strings).
    - `finish()` sends `{ "realtimeInput": { "audioStreamEnd": true } }`, resolves `{ ok: true, text }` with the full text when a final arrives after it, closes the socket.
    - `finish()` with only partials resolves after 3000 ms with the partial text as `ok: true`.
    - `finish()` with no text at all resolves `{ ok: false }` after 3000 ms.
    - A non-clean close before `finish` calls `onFailure` once; a close after `close()` calls nothing.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** with zod schemas for the two message shapes (`serverContent.interimInputTranscription.text`, `serverContent.inputTranscription.text`, `setupComplete`), adjusted to whatever Task 1 recorded.
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(coach): add the live transcription session`.

### Task 5: Live recorder hook with fallback

**Files:**

- Modify: `src/modules/coach/use-voice-recorder.ts` (replace the `MediaRecorder` flow), `src/modules/coach/__tests__/helpers.ts` (fakes), `src/modules/coach/__tests__/use-voice-recorder.test.ts` (rewrite)

**Interfaces:**

- Consumes: Tasks 3 and 4.
- Produces (replaces v1's `VoiceDeps` and `VoiceRecorderLike`):

```ts
export type AudioSource = {
    sampleRate: number
    onFrames: (listener: (frames: Float32Array) => void) => void
    release: () => void
}
export type VoiceDeps = {
    isSupported: () => boolean // AudioWorklet, mediaDevices and WebSocket present
    openAudio: () => Promise<AudioSource> // creates and resumes the AudioContext synchronously before its first await
    fetchToken: (signal: AbortSignal) => Promise<Response>
    openSocket: (url: string) => LiveSocket
    transcribe: (audio: Blob, signal: AbortSignal) => Promise<Response> // v1 route, used as the fallback
}
export type VoiceState = 'idle' | 'starting' | 'recording' | 'finishing' | 'transcribing'
export type VoiceTarget = {
    begin: () => void
    show: (text: string) => void
    commit: (text: string) => void
    discard: () => void
}
export function useVoiceRecorder(options: { deps?: VoiceDeps; target: VoiceTarget }): {
    supported: boolean
    state: VoiceState
    seconds: number
    error: VoiceErrorKind | null
    toggle: () => void
    cancel: () => void
}
```

- [ ] **Step 1: Rewrite the hook tests** with fakes for audio (records `release`, lets the test push frames at 48 kHz), token (`200 { token: 't' }` by default), socket (from Task 4's fake) and transcribe:
    - `openAudio` is called synchronously inside `toggle` (assert it was called before `await`ing anything); the token is fetched in parallel.
    - Frames become 1600 sample chunks on the socket after `setupComplete`; partial and final messages reach `target.show` with the composed text; `target.begin` once at start.
    - Stop: state `finishing`, `audioStreamEnd` sent, final arrives, `target.commit(final)`, audio released, socket closed, `idle`.
    - Wall-clock cap: with `Date.now` advanced 60 s (fake timers advance both), the recording finishes on its own.
    - Fallback, one case each: token `502`; token fetch rejects; socket closes non-clean before `setupComplete`; socket closes non-clean after partials; `finish` resolves `{ ok: false }`. Each posts one WAV (`audio/wav`, containing every chunk sent) to `transcribe`, state `transcribing`, then `target.commit(fallback text)`.
    - Fallback fails after partials: `target.commit(last partial)` and error `failed`. Fallback fails with no partials: `target.discard()` and the error for its status (`busy` on 429, `no-speech` on blank text, else `failed`).
    - No speech at all (live `{ ok: false }` and fallback blank text): `target.discard()`, `no-speech`.
    - `openAudio` rejecting with `NotAllowedError` gives `mic-blocked`; any other rejection, or `onFrames`/worklet setup throwing, gives `failed` with everything released.
    - A tap during `starting` cancels that attempt (its audio released when it resolves) and starts a new one: two `openAudio` calls, one live session.
    - Taps during `finishing` or `transcribing` are ignored.
    - `cancel()` in any state: socket closed, audio released, requests aborted, `target.discard()`, `idle`, no commit later; unmount does the same.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.** Browser deps: `openAudio` creates `new AudioContext()`, calls `resume()`, then awaits `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })`, adds the worklet from a `Blob` URL of `PCM_WORKLET_SOURCE`, connects source to the worklet node (not to the destination), and `release` stops the tracks, disconnects and closes the context. `openSocket` wraps `WebSocket`, passing only string messages. `fetchToken` POSTs `/api/coach/transcribe/token`.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(coach): stream voice input live with an upload fallback`.

### Task 6: Live text in the composer

**Files:**

- Modify: `src/modules/coach/use-coach-composer.ts` (replace `appendText` with a `voiceTarget`), `src/modules/coach/coach-chat-view.tsx`, `src/modules/coach/coach-voice-button.tsx`, `src/modules/coach/__tests__/coach-chat-view.test.tsx`, `docs/tech-specs/coach-chat.md` (voice bullet), the spec (v2 Status: implemented)

**Interfaces:**

- Consumes: `VoiceTarget`, `VoiceState` (Task 5).
- Produces: `useCoachComposer` returns `voiceTarget: VoiceTarget`. `begin` stores the current text as the prefix; `show(text)` sets the field to prefix + one space + text (no space when the prefix is empty or ends in whitespace; the prefix is never trimmed); `commit(text)` does the same with validation and focuses the textarea; `discard` restores the prefix.

- [ ] **Step 1: Update the view tests** (fake deps from Task 5): live partial then final text show in `coach-input` after `Plan for`; the textarea has `readOnly` during `recording` and `finishing`, not after; closing the panel mid recording leaves `Plan for`; `starting`, `finishing` and `transcribing` disable the button with the spinner; the recording icon is `coach-voice-stop-icon` (a filled circle, not the square used by `coach-stop`); a trailing newline in the typed text is kept. Keep the v1 cases that still apply (hidden when unsupported, error copies, timer, works while streaming); drop the ones about appending after a finished upload.
- [ ] **Step 2: Run** `pnpm test src/modules/coach/__tests__/coach-chat-view.test.tsx`. Expected: new cases FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Full verification:** `pnpm test`, `pnpm fmt`, `pnpm check`, `pnpm knip`. Expected: all green.
- [ ] **Step 5: Commit** `feat(coach): show live voice text in the composer`.
- [ ] **Step 6: Manual check by the athlete:** desktop Chrome and the iPhone home screen app, a Portuguese question with a Hyrox term, text appears while speaking; then with the network throttled or offline mid recording, the fallback fills the box.
