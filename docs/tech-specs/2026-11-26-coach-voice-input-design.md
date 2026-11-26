# Coach voice input

A microphone button in the coach chat composer ([coach-chat.md](coach-chat.md)). The athlete taps
it, speaks, taps again, and what they said is transcribed and written into the message box. The
message is not sent: the athlete reviews or edits it and sends it as usual.

Status: implemented. The smoke test against the live API and the manual check on the iPhone PWA
are still pending (see "What is not verified yet").

## Intent

Typing a long question on a phone (often right after a session) is slow. Speaking is faster. The
athlete mostly uses the app installed as a PWA on the phone, so the feature has to work there,
including the iPhone home screen app.

## Goals

- A microphone button next to Send. Tap to start recording, tap again to stop.
- The transcript is appended to whatever is already in the box (separated by a space), never sent
  on its own.
- Works on Chrome, Safari and Firefox, desktop and mobile, including the installed PWA on iPhone.
- Portuguese (Portugal) and English both transcribe well, with punctuation, without choosing the
  language first.
- Costs nothing: Gemini free tier, without using the quota of the coach chat models.

## Non-goals and anti-goals

- No live text while speaking, no streaming transcription.
- No sending by voice, no voice replies from the coach.
- No storing the audio anywhere (database, storage, logs). The audio lives only for the request.
- No daily cap of its own in v1 (the access flag already limits who can call it; see "Left out").
- Anti-goal: the transcript replacing or wiping text the athlete already typed.
- Anti-goal: a transcription model that "answers" the audio instead of transcribing it.

## Approaches

1. **Browser Web Speech API.** Live text, no backend, no quota. Rejected: not in Firefox, and
   historically unreliable in the iPhone home screen PWA, which is the main place this is used.
2. **Gemini, dedicated `gemini-3.5-transcribe` model (chosen).** Record in the browser with
   `MediaRecorder`, upload when the athlete stops, transcribe on the server. Works in every
   browser. The model is built for speech to text: Stable, free on the free tier (input and output),
   supports `pt-PT`, detects the language on its own and applies punctuation and casing ("smart"
   mode). Free tier limits are per model, so it does not eat the coach models' quota.
3. **Gemini, a coach chat model with an audio part** (`gemini-3.1-flash-lite` through the
   `@ai-sdk/google` the coach already uses, `generateText` with a file part and a "transcribe this"
   prompt). Known to accept `audio/webm` and works through the existing SDK. Slightly lower quality
   and may paraphrase or answer instead of transcribing. **Plan B** if option 2 fails the smoke test.

Picked by the athlete: option 2, with option 3 as plan B.

### What is not verified yet about `gemini-3.5-transcribe`

From Google's docs (read 2026-11-26): it is called through the Interactions API
(`POST https://generativelanguage.googleapis.com/v1beta/interactions`, header `x-goog-api-key`),
not `generateContent`, so the AI SDK cannot call it. Options go in
`generation_config.transcription_config` (`mode: "smart"`, optional `language_codes`). The docs'
examples pass a Files API `uri`; they do not show inline audio, and they do not confirm
`audio/webm` (Chrome, Firefox, Android) or `audio/mp4` (Safari, iPhone).

Confirmed from the docs on 2026-11-26 (Interactions API reference and the transcribe page, read by
the author): an inline part is `{ "type": "audio", "data": "<base64>", "mime_type": "<type>" }`;
the transcript is at `steps[].content[]` parts of type `text` (`steps[0].content[0].text` in the
docs' example) and an interaction has a `status` (`completed`, `failed` and others). The supported
list has `audio/webm` and `audio/m4a` but not `audio/mp4`, so the transcriber sends Safari's
`audio/mp4` clips as `audio/m4a` and drops codec parameters. The docs disagree on the inline size
limit (20 MB on the audio page, 100 MB on the file input page); clips here are under 2 MB either way.

So step one is a smoke script, `tools/gemini-transcribe-smoke.ts <audio file>`, run by the athlete
with their key, that sends a short clip inline (base64) in webm and in mp4 and prints the
transcript or the error. If inline webm and mp4 both work, option 2 goes ahead. If inline does not
work but a Files API upload does, upload then transcribe (two calls per clip) is acceptable. If the
model rejects the formats or is not on the free tier for this project, switch to option 3. The
outcome is recorded in this spec.

## Design

### Client

- `useVoiceRecorder` hook (colocated in `src/modules/coach/`): asks for the microphone with
  `getUserMedia`, records with `MediaRecorder` in the browser's default format, stops on the second
  tap or automatically at **60 seconds**, then posts the clip and returns the text. States: `idle`,
  `recording` (with elapsed seconds), `transcribing`, plus an error message. The browser APIs are
  passed in as dependencies so tests use fakes. The microphone tracks are always stopped when
  recording ends or the chat closes.
- Button in `coach-chat-view.tsx`, before Send: a mic icon when idle, a stop icon with a pulsing
  dot and the elapsed time while recording, a spinner (disabled) while transcribing. Hidden when the
  browser has no `MediaRecorder` or `getUserMedia`. It stays usable while the coach is answering,
  like the text box.
- The transcript is trimmed and appended to the `message` field through the composer form
  (`setValue` with validation), then the textarea gets focus. If the result goes over
  `COACH_MESSAGE_MAX_CHARS` the existing counter and error show it; nothing is cut.
- Errors show as one muted line under the box (same place as the input error): microphone blocked
  ("Allow microphone access in your browser settings"), nothing heard ("Didn't catch that. Try
  again."), busy ("Transcription is busy. Try again in a minute."), anything else ("Couldn't
  transcribe. Try again.").

### Server

- Route `POST /api/coach/transcribe` (`src/app/api/coach/transcribe/route.ts`), authenticating
  itself like the chat and upload routes (session plus the `roxcoach` access flag). Body is
  `multipart/form-data` with one `audio` file.
- Validation before any Gemini call: the MIME type is in an allowlist (`audio/webm`, `audio/mp4`,
  `audio/ogg`, `audio/mpeg`, `audio/wav`, codec parameters stripped), size at most **2 MB** (60
  seconds of browser audio is well under 1 MB), not empty.
- A transcriber provider in `src/_bff/modules/coach/providers/` calls the Interactions API with
  `fetch` (no new dependency), `mode: "smart"`, no `language_codes` (auto detect), and a timeout. It
  is passed into the handler so tests use a fake. The key is read only in the route, like the chat.
- Responses: `200 { text }` (text may be empty), `401/403` as the chat, `413` too large, `415`
  format not allowed, `422` no audio, `429` rate limited, `502` other model failure, `503` key not
  configured (the same status choices as the upload route). The audio and the
  transcript are never logged; failures log only the status and an error tag.

- The `Permissions-Policy` header in `next.config.ts` allows the microphone on our own origin
  (`microphone=(self)`). It used to deny it (`microphone=()`), which makes the browser refuse
  `getUserMedia` at once, with no permission prompt (found in the first manual test).

### Spec and tests

- `coach-chat.md` gets a "Voice input" section; this file records the smoke test outcome.
- Unit tests: the recorder hook with fake `MediaRecorder`, `getUserMedia` and fetch (start, stop,
  auto stop at 60 s, permission denied, tracks stopped); the route handler with a fake transcriber
  (auth, allowlist, size cap, status mapping); the view (button hidden when unsupported, states,
  transcript appended to existing text). All located by `data-testid`.

## Live transcription (v2)

Status: implemented (design approved by the athlete on 2026-11-26, "Live with fallback"). The live
smoke run and the manual checks are still pending (see "Not verified yet" below).

Built differently from the plan, on purpose: the mic button stays tappable while the permission
prompt is pending (a tap starts over, since a dismissed prompt can hang forever), so `starting`
shows a spinner but is not disabled; an empty live result stays "Didn't catch that" rather than an
error (silence is normal), with a warn log `EmptyTranscript` on the upload route.

The first version works, but the athlete waits for the whole clip to upload and transcribe after
they stop. v2 writes the text into the box while they speak.

### Approaches

1. **`gemini-3.5-transcribe-live` over a WebSocket, with the v1 route as fallback (chosen).** Free
   on the free tier, in preview. Partial text arrives while speaking and a cleaned, punctuated text
   at each pause. If the live connection fails, the same audio goes through the v1 route.
2. **Live only.** Simpler, but a preview model that is down leaves the button useless. Rejected by
   the athlete.
3. **Browser Web Speech API.** Still rejected for the reasons in "Approaches" above.

### What Google's docs say (read 2026-11-26)

- The browser connects to
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`
  with an **ephemeral token** in the `access_token` query parameter, never the API key.
- The server creates the token with `POST https://generativelanguage.googleapis.com/v1beta/auth_tokens`
  (header `x-goog-api-key`): `uses: 1`, `newSessionExpireTime` (time to open the session),
  `expireTime` (time to keep sending), and `liveConnectConstraints` that lock the model and config.
  The exact response JSON is not in the docs (the SDK reads the token from `name`).
- Setup message: `{ "setup": { "model": "models/gemini-3.5-transcribe-live", "generationConfig":
  { "responseModalities": ["TEXT"] }, "inputAudioTranscription": { "languageCodes": [], "mode":
  "SMART" } } }`.
- Audio in: raw 16-bit PCM, 16 kHz, mono, little-endian, about 100 ms per chunk, sent as
  `{ "realtimeInput": { "audio": { "data": "<base64>", "mimeType": "audio/pcm;rate=16000" } } }`,
  and `{ "realtimeInput": { "audioStreamEnd": true } }` at the end. No webm or opus.
- Text out: `serverContent.interimInputTranscription.text` is a fast, speculative partial;
  `serverContent.inputTranscription.text` is final. In SMART mode the final text is the whole
  cleaned transcript of the session so far and replaces what the client shows.
- Sessions last up to 10 minutes. No quota or latency numbers are published.

### Design

**Token route.** `POST /api/coach/transcribe/token`, same session and access checks as the v1
route, answers `{ token }`. It creates a token with `uses: 1`, `newSessionExpireTime` now + 1
minute, `expireTime` now + 3 minutes (the recording cap is 60 seconds), and constraints locking
the model and the setup config above, so a leaked token can only open one short transcription
session. No body. Same status mapping as the v1 route (401, 403, 503, 429, 502, 500). The token is
never logged.

**Audio capture.** `MediaRecorder` is replaced by an `AudioContext` with an `AudioWorklet` that
downsamples the microphone to 16 kHz mono PCM16 and posts 100 ms chunks (1600 samples). The
`AudioContext` is created in the tap handler itself, before any await, because iOS only starts
audio from a user gesture. The downsampling, the PCM16 conversion and a WAV encoder are pure
functions with unit tests.

**Live session.** On tap the client asks for the microphone and the token at the same time, opens
the WebSocket, sends the setup, buffers chunks until `setupComplete`, then streams them. The text
shown is the last final text plus the current partial. On stop (or at 60 seconds) it sends
`audioStreamEnd` and waits up to 3 seconds for the last final text, then closes.

**In the box.** The text already typed is kept as a prefix; while recording the field shows that
prefix plus the live text, and the textarea is read only so typing cannot fight the live text. On
stop the final text stays and the box is editable again. Cancelling (closing the panel) restores
the prefix alone.

**Fallback.** Every chunk is also kept in memory (60 seconds of 16 kHz PCM16 is about 1.9 MB,
under the 2 MB cap of the v1 route). If the token request fails, the socket does not open, it
closes with an error before a final text, or no text arrives at all, the chunks are encoded as WAV
(`audio/wav`, already allowed) and posted to `POST /api/coach/transcribe`. The fallback result
replaces any partial live text. The athlete sees the spinner during the fallback, as in v1.

**Unchanged.** The 60 second cap, the error copy, the mic button states (plus live text), cancel on
panel close, the v1 route and transcriber.

**Tests.** Pure audio helpers (downsample, PCM16, WAV header); the token handler with a fake token
creator; the token creator with a fake fetch (request body, constraints, status mapping); the live
recorder hook with a fake socket and a fake audio source (partial then final text, buffering until
setup, stop waits for the final, every fallback trigger, cancel restores the prefix, one session
for a double tap); the view (live text in the box, read only while recording).

### Not verified yet

The token response field, whether the token constraints accept `mode: "SMART"`, and how the live
model handles Portuguese partials. A smoke script, `tools/gemini-live-smoke.ts`, creates a token
and streams the existing sample WAV through the socket, printing every server message. The athlete
runs it before the client is built on it; any difference goes into this section.

## Left out

- A daily transcription cap and usage counting. Revisit if the free tier quota becomes a problem.
- A language picker or custom vocabulary (Hyrox station names, for example) through
  `language_codes` or vocabulary biasing. Add only if auto detect gets terms wrong in practice.

## Calls made by the author (not discussed)

60 second limit, 2 MB cap, tap to start and tap to stop (not hold to talk), append instead of
replace, button usable while the coach is answering, no daily cap in v1, auto language detection.
