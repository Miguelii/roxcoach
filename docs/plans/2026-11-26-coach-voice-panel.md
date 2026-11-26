# Coach Voice Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On phones, a WhatsApp style recording panel under the coach message box (time, waveform, discard, pause, send straight to the coach).

**Architecture:** `useVoiceRecorder` gains pause, resume, a finish intent (`review` | `send`) and a level history; `useCoachComposer` sends on a `send` commit when the coach is not answering; a new `CoachVoicePanel` renders under the form with `md:hidden`, while the row's mic and Send hide below `md` during a recording. Desktop keeps the mic toggle (`review`).

**Tech Stack:** React 19 (React Compiler), react-hook-form, Tailwind with semantic tokens, lucide-react icons, vitest via `pnpm test`.

**Spec:** `docs/tech-specs/2026-11-26-coach-voice-panel-design.md` (builds on `docs/tech-specs/2026-11-26-coach-voice-input-design.md`).

## Global Constraints

- English code and copy, no em-dashes, `@/` imports, `type Props`, types at the top of the file.
- Tests locate by `data-testid` only; no module mocks (use `fakeVoiceDeps`).
- Semantic tokens only: pause uses `destructive`, send uses `primary` / `primary-foreground`.
- Touch targets at least 44 px (`size-11` or larger); every icon button has an `aria-label`.
- Phones only for the panel: below `md` (768 px), via CSS, never `useIsMobile`.
- The 60 second cap (`VOICE_MAX_SECONDS`) counts recorded time only.
- Live token `expireTime` is now + 10 minutes; `newSessionExpireTime` stays now + 1 minute.
- Nothing is sent when the transcription fails or while the coach is answering; the text stays in the box.
- `pnpm test`, `pnpm check`, `pnpm knip` green before each commit; update `docs/tech-specs/coach-chat.md` in the change that changes the UI.

## Review Focus

1. Send tapped twice quickly: one message only (second tap ignored once finishing). Test in Task 1.
2. The panel closed (chat closed) while paused: microphone and socket released, box back to the prefix. Test in Task 3.
3. A long pause after which Google has closed the socket: send runs the upload fallback and still sends. Test in Task 1.
4. Send while the coach answers, with typed text before the recording: the whole box (prefix plus transcript) stays, nothing sent. Test in Task 2.
5. Rotating the phone to a width at or above `md` mid recording: the row's mic shows the stop state and the recording keeps going (CSS only, no state change). Not testable in jsdom; checked by hand.

---

### Task 1: Recorder pause, resume, finish intent and levels

**Files:**

- Modify: `src/_bff/core/constants/transcribe-live.constants.ts` (`SESSION_WINDOW_MS = 600_000`)
- Modify: `src/_bff/core/constants/__tests__/transcribe-live.constants.test.ts` (expireTime `'2026-11-26T10:10:00.000Z'`)
- Modify: `src/modules/coach/pcm-audio.ts`, `src/modules/coach/use-voice-recorder.ts`
- Test: `src/modules/coach/__tests__/pcm-audio.test.ts`, `src/modules/coach/__tests__/use-voice-recorder.test.ts`

**Interfaces:**

- Produces in `pcm-audio.ts`: `levelOf(chunk: Int16Array): number` (root mean square scaled to 0..1, 0 for an empty chunk).
- Produces in `use-voice-recorder.ts`:
    - `VoiceState = 'idle' | 'starting' | 'recording' | 'paused' | 'finishing' | 'transcribing'`
    - `VoiceIntent = 'review' | 'send'`
    - `VoiceTarget.commit: (text: string, intent: VoiceIntent) => void`
    - hook result `{ supported, state, seconds, levels: number[], error, toggle, pause, resume, finish: (intent: VoiceIntent) => void, cancel }`
    - `LEVEL_HISTORY = 40` (exported for tests): `levels` keeps the last 40 chunk levels, oldest first, reset on start.

- [ ] **Step 1: Write the failing tests**
    - pcm-audio: `levelOf(Int16Array.of(16384, -16384))` close to `0.5`; `levelOf(new Int16Array(0))` is `0`.
    - constants: expireTime `'2026-11-26T10:10:00.000Z'`.
    - hook (existing `setup`, `connect`, `speak`, `toggle` helpers):
        - `'pauses: no audio is sent and the seconds freeze'`: toggle, connect, advance 2000 ms, `act(() => result.current.pause())`, state `'paused'`, `speak` then `audioSent(socket.sent)` unchanged, advance 5000 ms, `seconds` still 2.
        - `'resumes and counts only recorded time toward the 60 second cap'`: pause at 10 s, advance 120_000 ms, still `'paused'`; resume, state `'recording'`, advance 50_000 ms, state `'finishing'`.
        - `'finishes from pause'`: pause, `finish('review')`, last sent message equals `STREAM_END`, state `'finishing'`.
        - `'commits with the send intent'`: `finish('send')`, final `'ok'` arrives, `target.commit` called with `('ok', 'send')`.
        - `'commits a partial left by a failed upload for review even when sending'`: as the existing "keeps the partial" case but `finish('send')`, commit called with `('wall balls', 'review')`.
        - `'sends through the upload when the socket closed during a pause'`: pause, `socket.drop()`, resume, speak, `finish('send')`, transcribe called once, commit `('hello coach', 'send')`.
        - `'ignores a second finish'`: `finish('send')` twice, `target.commit` called once after the final.
        - `'keeps the last 40 chunk levels'`: speak 50 chunks of 0.25, `levels` length 40 and last value close to 0.25.
    - Update the existing commit assertions to the two-argument form (`'review'` for the toggle path).
- [ ] **Step 2: Run `pnpm test src/modules/coach src/_bff/core/constants`.** Expected: the new cases FAIL (`pause is not a function`, wrong expireTime).
- [ ] **Step 3: Implement.** Session gains `intent: VoiceIntent`, `recordedMs: number`, `resumedAt: number`. `pause` only from `recording` (clear timer, add elapsed to `recordedMs`); `resume` only from `paused` (restart timer); frames are dropped unless `recording`. `finish(intent)` from `recording` or `paused` sets the intent and runs today's `stop`; `toggle` calls `finish('review')` for `recording` and `paused`. The tick computes `seconds` from `recordedMs` plus the running span. The chunker callback pushes `levelOf(chunk)` into `levels` (state, capped at `LEVEL_HISTORY`). The partial-after-failed-upload commit always uses `'review'`.
- [ ] **Step 4: Run `pnpm test src/modules/coach src/_bff/core/constants`.** Expected: PASS (the composer's `commit` signature change makes the view typecheck fail until Task 2, so do not commit yet).

### Task 2: Composer sends on a send commit

**Files:**

- Modify: `src/modules/coach/use-coach-composer.ts`, `src/modules/coach/coach-chat-view.tsx` (pass `streaming`)
- Test: `src/modules/coach/__tests__/coach-chat-view.test.tsx`

**Interfaces:**

- Consumes: `VoiceTarget.commit(text, intent)` from Task 1.
- Produces: `useCoachComposer({ onSend, streaming }: { onSend: (text: string) => void; streaming: boolean })`, same result `{ form, submit, voiceTarget }`. A `'send'` commit writes the joined text, then sends it trimmed and clears the box, unless the coach is streaming or the text is over `COACH_MESSAGE_MAX_CHARS` (then it stays in the box, validated and focused, like `'review'`). `streaming` is read through a ref synced in an effect, so a commit after an await sees the current value.

- [ ] **Step 1: Write the failing view tests** (driving the hook through the panel is Task 3, so here call the desktop path and a `send` commit through the panel button added in Task 3; until then write them against `screen.getByTestId('coach-voice-send')` and let them fail)
    - `'sends the typed text and the transcript to the coach from the panel'`: type `'Plan for'`, tap mic, connect, speak, partial `'tomorrow'`, click `coach-voice-send`, final `'tomorrow.'`, flush; `send` called once with body `message: 'Plan for tomorrow.'`; box value `''`.
    - `'keeps the voice text in the box when the coach is still answering'`: send `'hi'` with a `controlledStream`, wait for `coach-stop`, type `'Plan for'`, record, click `coach-voice-send`, final `'tomorrow.'`; `send` called once (the first message only); box value `'Plan for tomorrow.'`.
    - `'sends nothing when the transcription fails'`: `fakeVoiceDeps({ tokenStatus: 502, respond: async () => Response.json({}, { status: 502 }) })`, record, speak, click send; `send` not called; `coach-voice-error` has text `"Couldn't transcribe. Try again."`.
- [ ] **Step 2: Run `pnpm test src/modules/coach/__tests__/coach-chat-view.test.tsx`.** Expected: FAIL (no `coach-voice-send`).
- [ ] **Step 3: Implement the composer change and pass `streaming` from `PanelBody`.**
- [ ] **Step 4:** continue to Task 3 (the tests need the panel); commit Tasks 1 to 3 together.

### Task 3: Mobile recording panel

**Files:**

- Create: `src/modules/coach/coach-voice-panel.tsx`
- Modify: `src/modules/coach/coach-chat-view.tsx`, `src/modules/coach/coach-voice-button.tsx` (move `formatElapsed` to `src/modules/coach/utils.ts` if both files use it; check the module for an existing `utils.ts` first)
- Modify: `docs/tech-specs/coach-chat.md` (UI bullet), `docs/tech-specs/2026-11-26-coach-voice-panel-design.md` (status: implemented)
- Test: `src/modules/coach/__tests__/coach-chat-view.test.tsx`

**Interfaces:**

- Consumes: the hook result from Task 1.
- Produces: `CoachVoicePanel({ voice }: Props)` with `type Props = { voice: ReturnType<typeof useVoiceRecorder> }`, returning `null` when `!voice.supported` or `voice.state === 'idle'`.

Layout and test ids (wrapper `md:hidden`, slides up with `transition-[translate] duration-200 starting:translate-y-full motion-reduce:transition-none`):

- `coach-voice-panel` wrapper; top row `coach-voice-panel-timer` (`text-2xl tabular-nums`, `m:ss`) and `coach-voice-waveform` (`aria-hidden`, one `coach-voice-bar` per level, height from the level, dots for the empty slots up to `LEVEL_HISTORY`).
- Bottom row: `coach-voice-discard` (ghost, `Trash2Icon`, aria-label `'Discard recording'`, calls `voice.cancel`, always enabled); `coach-voice-pause` (outline circle `border-destructive text-destructive`, `PauseIcon` with aria-label `'Pause recording'` while recording, `MicIcon` with `'Resume recording'` while paused, disabled in other states); `coach-voice-send` (`rounded-full bg-primary text-primary-foreground size-12`, `SendIcon`, aria-label `'Send voice message'`, calls `voice.finish('send')`, disabled while starting, shows `Loader2Icon` spinning and is disabled while finishing or transcribing).
- In `PanelBody`: render `<CoachVoicePanel voice={voice} />` after the form; wrap `CoachVoiceButton` and the Send button in `cn(voiceActive && 'max-md:hidden')`.

- [ ] **Step 1: Write the failing view tests**
    - `'shows the panel with the time, the waveform and three buttons while recording'`: tap mic, connect, speak twice; `coach-voice-panel` present, timer text `'0:00'`, two `coach-voice-bar`, discard, pause (aria-label `'Pause recording'`), send present.
    - `'hides the row mic and Send on phones while recording'`: after tap, `coach-voice` and `coach-send` wrappers have class `max-md:hidden`; after discard they do not.
    - `'pauses and resumes from the panel'`: click pause, aria-label becomes `'Resume recording'`; click again, `'Pause recording'`.
    - `'discards from the panel and restores the typed text'`: type `'Plan for'`, record, partial `'x'`, click discard; box `'Plan for'`, panel gone.
    - `'disables send while the microphone starts and spins while finishing'`: `pendingAudio: true`, tap; send disabled; resolve, record, click send; send disabled and aria-busy or spinner test id `coach-voice-send-spinner` present.
    - `'releases everything when the chat closes while paused'`: record, connect, pause, close the panel (`coach-close`); audio released, socket closed, box back to the prefix.
- [ ] **Step 2: Run `pnpm test src/modules/coach`.** Expected: the new Task 2 and Task 3 cases FAIL.
- [ ] **Step 3: Implement the panel and the view wiring; update both specs.**
- [ ] **Step 4: Run `pnpm test`, `pnpm check`, `pnpm knip`.** Expected: all green.
- [ ] **Step 5: Commit**

```bash
git add src/modules/coach src/_bff/core/constants docs/tech-specs docs/plans/2026-11-26-coach-voice-panel.md
git commit -m "feat(coach): add the mobile voice recording panel"
```
