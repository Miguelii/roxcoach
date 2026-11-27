# Coach model fallback

The coach chat ([coach-chat.md](coach-chat.md)) runs on the Google Gemini free tier. Each Gemini
model has its own free quota, so when one model reaches its limit another may still have room. This
spec adds a fixed, ordered list of models: when the current one is rate limited, the server retries
the same request on the next one. The chat never stops to ask anything. It shows the model that is
answering as a small caption under the message box, and, when a switch happens, a short note in the
conversation.

Status: implemented (model list, fallback wrapper, Gemini provider changes, saved model, route
wiring, smoke script, chat caption and switch note). The manual checks under "Open questions" are
still pending.

## Intent

The free tier is the whole reason the chat costs nothing, and its limits are low and per model. A
single model means the athlete sees "The coach is busy, try again in a minute" whenever its quota
runs out. With several models in order, a rate limit becomes an automatic switch to the next model,
and the chat only fails when every model in the list is exhausted. The athlete can see which model is
answering and when it changed.

## Goals

- When a model answers with a rate limit (or a server failure) before it has produced any text, retry
  the same request on the next model of the list, with no action needed from the athlete.
- Show the model that is answering as a small caption under the message box.
- When a reply comes from a fallback model, show a short, muted note in the conversation, right before
  that reply, saying which model is not available and which one is answering.
- One place in the code defines the models and their order. No environment variable chooses a model.
- The model that really answered is saved with the assistant message (the `model` column already
  exists) and returned with the conversation history.
- The chat keeps its current behavior for every other outcome (cancel, blocked prompts, daily cap,
  partial replies).

## Non-goals and anti-goals

- No switch once any text of the reply has been streamed: continuing the same answer on another model
  would give a duplicated or incoherent reply. That case stays the existing busy error.
- No switch on a blocked prompt (another model would refuse the same request).
- No per-instance memory of which model is exhausted in v1 (see "Left out"). No quota tracking, no
  admin screen, no per-athlete model choice, no paid models.
- Not a fix for the daily message cap. That cap (50 per athlete per day) is separate and unchanged.
- Anti-goal: letting a model failure produce a partial or duplicated reply, or showing technical
  details (error codes, quota numbers) in the chat. The caption shows a friendly model name only.

## The model list

`COACH_MODELS` in `src/_bff/core/constants/coach-models.constants.ts` is an ordered array of
`{ id, label }` entries (the Gemini API id and the friendly name). `coachModelLabel(id)` in the same
file returns the label of a listed id, or the raw id when it is not listed. Position 0 is tried first. The order is best first, by expected quality for this job (following
instructions, calling the read-only tools, answering in the athlete's language), then by
generation. Flash models come before Flash Lite models because tool calling is the weak point of
the small models.

Order, as in the code (the athlete's candidates plus Gemini 3.6 Flash, ranked by the author; checked
against Google's public docs, see "Verification"). The label is what the chat shows:

| #   | Label                 | API id                   | Status in Google's docs                                       | Free tier | Function calling |
| --- | --------------------- | ------------------------ | ------------------------------------------------------------- | --------- | ---------------- |
| 1   | Gemini 4 Hydrogen     | `gemini-4-hydrogen`      | Stable (updated November 2026)                                | Yes       | Supported        |
| 2   | Gemini 3.8 Flash      | `gemini-3.8-flash`       | Stable (updated September 2026)                               | Yes       | Supported        |
| 3   | Gemini 3.6 Flash      | `gemini-3.6-flash`       | Stable, "previous-generation Flash, available for production" | Yes       | Supported        |
| 4   | Gemini 3 Flash        | `gemini-3-flash-preview` | Preview (stricter limits expected)                            | Yes       | Supported        |
| 5   | Gemini 3.5 Flash Lite | `gemini-3.5-flash-lite`  | Stable (updated July 2026)                                    | Yes       | Supported        |
| 6   | Gemini 3.1 Flash Lite | `gemini-3.1-flash-lite`  | Stable (the old `-preview` id is shut down)                   | Yes       | Supported        |
| 7   | Gemini 2.5 Flash Lite | `gemini-2.5-flash-lite`  | Not deprecated, access limited to users who used it before    | Yes       | Supported        |

Ranking rule: newest generation and Flash class first, then the Lite models, because tool calling is
the weak point of the small ones. The preview model sits behind the stable Flash models because
previews can change and have stricter limits. 2.5 Flash Lite is last because Google limits it to
projects that used it before, so it may simply not work for this project.

Removed from the athlete's candidates: **Gemini 2.5 Flash** (`gemini-2.5-flash`). Google's docs mark
it deprecated, no longer selectable in AI Studio, available through the API only to existing users,
and routed to `gemini-3.5-flash-lite` from December 1, 2026. Added at the athlete's request:
**Gemini 3.6 Flash** (`gemini-3.6-flash`).

Context sizes are the same for all of them for this use: about 1M tokens in, 65,536 out (Hydrogen
allows more output with long decode, not needed here). Gemini 3.8 Flash does not support the
`minimal` thinking level (it errors), so the provider sets no thinking level or thinking option for
any model. The paid
prices of 3.8 Flash and 3.6 Flash double on January 1, 2027, which does not matter on the free tier.

### Verification

Verified on 2026-11-21 from Google's public pages (ai.google.dev redirects to
aistudio.google.com/docs): the models, pricing and rate-limits pages and the per-model page of every
model in the table. What the docs confirm: the exact ids, the status labels, "Free of charge" for
input and output on the free tier for these models (verbatim for Hydrogen, 3.8 Flash, 3.6 Flash and
3.5 Flash Lite; for the older ones from a summary of the pricing page), and function calling,
structured outputs and thinking supported on every model of the list. No page shows a date marker
for the page itself, only per-model "latest update" months.

Not verifiable from the docs, and therefore still a rule: the athlete runs the smoke script (see
"Configuration changes") and every id that does not answer `OK` on the free tier is removed from
`COACH_MODELS` instead of being left in as dead weight. The ranking is a judgment, not a benchmark:
it is revisited after the manual end to end check of five real questions per model (goal check, last
long run, week comparison, a Hyrox session with stations, a question with no data), and any model
that fails tool calls moves down or out.

## Behavior

`createFallbackCoachModel(models, { onFallback })` (`providers/fallback-coach-model.ts`) wraps the
models of the list in order and is itself a `CoachModel` (its `modelId` is the first model's id, and it
throws a `RangeError` for an empty list). `buildCoachModels` (`helpers/build-coach-models.helper.ts`)
creates one Gemini model per id and wraps them. The chat handler, the service and the tools do not
change: they receive one model.

For each request it runs the models in order (before each model, and on every event, it stops if the
request signal is aborted):

1. Start the stream of model `i`. Any `model` event a provider emits itself is dropped: only the
   wrapper announces the model.
2. The first `text` event commits the reply to this model. The wrapper then emits the `model` event
   (see below) followed by that text, and passes every later event of this stream through unchanged,
   including a failure.
3. If, before any text, model `i` ends with an `error` event of kind `rate_limited` or `unavailable`,
   that failure is discarded and model `i + 1` starts with the identical request (system prompt,
   history, tools, step limit, abort signal). The same applies when the model throws, or when its
   stream ends without a terminal event, before any text: both count as `unavailable`.
4. Any other terminal event before text (`blocked`, or a `done` with no text) is passed through and ends
   the chain: a `blocked` outcome is never retried.
5. An abort of the request signal stops everything: no further model is started, nothing more is
   emitted, no failure is recorded and `onFallback` is not called.
6. After text, a throw from the model is rethrown unchanged (the service turns it into an
   `unavailable` error event) and no other model is tried.
7. When every model failed before text, the wrapper emits ONE `error` event: kind `rate_limited` if
   every failure was a rate limit, otherwise `unavailable`.

Tools are read-only, so a model that called tools and then failed before emitting text leaves nothing
behind; the next model simply runs the tools again.

### Which model answered, on the wire

The NDJSON stream (see [coach-chat.md](coach-chat.md)) has one event for it:

`{ "type": "model", "model": "<model id>", "switchedFrom": "<model id>" | null }`

The wrapper emits it once per reply, right before the first `text` event. A reply that ends without
any text (a `done` or an error before text) has no `model` event. `switchedFrom` is the id of the
model skipped last (the last one that failed), or `null` when the first model of the list answered.
Inside the server the same event is `{ type: 'model', modelId, switchedFrom }`, and the chat service
maps `modelId` to the wire key `model`. Clients that do not know the event ignore it, as the UI
already ignores unknown event types.

The chat service saves the id of the model that answered in `coach_messages.model`: the id of the last
`model` event of the reply, or the provider's own `modelId` when none was seen (a single model, no
wrapper). `MessageDTO.model` is `string | null` (null for user messages and for any row without a model; older
replies hold the id that was configured when they were saved, for example `gemini-2.5-flash`, which
the caption shows as the raw id, because the label map only knows the listed models) and is returned with the conversation history.

### What the chat shows

Two elements, both UI only: nothing is added to the saved messages.

**Caption under the message box.** Small muted text inside the panel, below the input and the send
button, with the friendly name of the model only (`Gemini 3.8 Flash`), on one line with an ellipsis.
It never carries the switch text: that sentence is too long for the narrow mobile panel and would
disappear when the next reply starts. The caption changes to the announced model on the first text
delta that follows the `model` event, so a reply that fails right after the event keeps the
previous caption.

**Switch note in the conversation.** A muted, small, centered line placed in the message list right
before the reply that came from a fallback model, for example "Gemini 3.8 Flash is not available right now.
Answering with Gemini 3 Flash." It is attached to the reply when the `model` event arrives with a
non-null `switchedFrom`. It exists in the session where the switch happened only: it is not saved and
does not appear when the conversation is reopened. It is not an alert and the live region does not
announce it.

```
 Coach                                      x
 +------------------------------------------+
 | you: How is my training for Lisbon?      |
 |                                          |
 |  Gemini 3.8 Flash is not available now.  |   <- switch note, muted
 |  Answering with Gemini 3 Flash.          |
 | coach: You are 6 weeks from the race...  |
 +------------------------------------------+
 | Ask your coach...                    [>] |
 | Gemini 3 Flash                           |   <- caption, name only
 +------------------------------------------+
```

| State                              | Caption                                    | Switch note                      |
| ---------------------------------- | ------------------------------------------ | -------------------------------- |
| New conversation, nothing sent yet | Nothing (the model is not known yet)       | None                             |
| A reply from the first model       | Its name                                   | None                             |
| A reply from a fallback model      | The fallback model's name                  | Shown before that reply          |
| The next reply starts              | Follows the `model` event of the new reply | Only if that reply also switched |
| A conversation is reopened         | The last non-null model of its messages    | None                             |
| Every model failed                 | Keeps the last known model                 | None; the existing error message |

The friendly name comes from `coachModelLabel` (the `label` of the `COACH_MODELS` entry). An id that
is not listed is shown as the raw id, so a retired model id in an old message never breaks the
caption or the note. A null model (old messages, or none yet) shows no caption. Test ids:
`coach-model-caption` and `coach-model-switch-note`.

### Gemini provider changes

`createGeminiCoachModel` (`providers/gemini-coach-model.ts`) differs from the single-model version in
two ways:

- It passes `maxRetries: 0` to the AI SDK, so an exhausted model fails at once and the fallback list
  is the only retry policy (otherwise the SDK would wait and retry the exhausted model first).
- It sets no thinking level and no thinking provider option, for any model (Gemini 3.8 Flash rejects
  `minimal`).

A rate limit is recognized from the HTTP status 429 of the provider error or its nested causes,
whether it is thrown or arrives as an `error` stream part, and maps to `rate_limited`. A content
filter finish maps to `blocked`; every other failure maps to `unavailable`. Each list entry uses the
same settings and only its own id.

## Logging and secrecy

When the wrapper skips a model, the route logs one line through `Logger` at level `warn` with prefix
`coachModelFallback` and metadata `{ modelId, kind }`, where `kind` is `rate_limited` or
`unavailable`. Model ids are not secrets. Nothing from the request, the reply, the context or the key
is logged, as everywhere else in the chat.

## Configuration changes

- `NEXT_COACH_MODEL` and the default model id `DEFAULT_COACH_MODEL` (`gemini-2.5-flash`) are gone:
  removed from `src/env/server.ts`, the architecture env table, the README setup note, the route and
  the smoke script. `NEXT_GEMINI_API_KEY` is the only coach variable.
- The route builds the list from `COACH_MODELS` and the key with `buildCoachModels`. The 503 "coach
  not configured" answer stays tied to the missing API key only.
- `tools/gemini-smoke.ts` takes an optional model id argument (`pnpm dlx tsx tools/gemini-smoke.ts
  gemini-3.8-flash`). The argument must match letters, digits, dot, dash, colon and underscore,
  otherwise it prints a usage line and exits with code 1. With no argument it checks every model of
  `COACH_MODELS` one by one. It prints one line per model, `<id>: OK` or `<id>: <status>` (an HTTP
  status number, `no-key` or `network`), and exits with code 1 if any model did not answer `OK`. It
  never prints the key, a response body or a prompt.

## Failure behavior

| Case                                              | Behavior                                                        |
| ------------------------------------------------- | --------------------------------------------------------------- |
| First model rate limited before any text          | The next model answers; the athlete sees nothing                |
| Model fails after streaming text                  | Existing busy error; no switch; partial text not saved          |
| Every model failed before text                    | One error event (`rate_limited` or `unavailable`), as today     |
| Blocked prompt                                    | Existing "cannot answer that" message, no switch                |
| Athlete cancels during a retry                    | Everything stops, user message saved, no assistant message      |
| A model id was retired by Google (404 or similar) | Counted as `unavailable` and skipped; the smoke script flags it |
| Only one model in the list                        | Behaves exactly as before                                       |

## Cost and latency

A 429 answers quickly, but a 503 or a hung connection can take many seconds, so a fallback adds roughly
one failed request per skipped model. The chat route allows 60 s (`maxDuration`), so the chain has a
time budget: `FALLBACK_DEADLINE_MS` (45 s). Before starting any model after the first, the wrapper
checks the time since the stream began; once the budget is spent it starts no further model and emits
the single aggregated `error` event (`rate_limited` only when every recorded failure was
rate limited, otherwise `unavailable`), so the athlete sees the usual "The coach is busy" state with
Retry instead of a stream cut by the platform. The budget never interrupts a model that is already
streaming. The daily cap and every other limit are unchanged. All listed models are free
tier; if the athlete later enables billing, models with paid usage must not be put in the list
without a spend limit (not applicable to the free tier).

## Left out of v1 (possible later)

- A per-server-instance memory of recently exhausted models (skip a model for a short time after a
  429, using the retry delay the API reports). It saves the failed round trip but only helps while an
  instance stays warm, so it is deferred.
- A setting in the app for the order, or a per-athlete choice.
- Splitting the quota by task (cheap model for short questions, stronger model for long analysis).

## Tests

- Chat service and handler: a `model` event is emitted once, before the first `text` event, with
  `switchedFrom` null when the first model answered and the skipped model's id after a fallback; the
  saved assistant message stores the answering model; the history DTO returns `model`.
- UI (fakes through the hook options, test ids only): the caption shows the friendly name and never
  the switch text, the switch note appears before the reply that came from a fallback model and not
  before one from the first model, the note is absent after reopening a conversation, an unknown model
  shows its raw id, a new conversation shows no caption, the caption follows the next reply, a reopened
  conversation shows its last assistant model, and a failed reply keeps the last known model.
- Fallback model with fake `CoachModel`s: first succeeds (no second call); first `rate_limited`
  before text, second succeeds (the second receives the identical request); `unavailable` before text
  also falls back; failure after text does not fall back and is passed through; `blocked` is passed
  through; every model failed gives one `error` (`rate_limited` only when all were rate limited);
  abort stops the chain with no further model started; a thrown error from a model counts as a
  failure; a stream that ends without a terminal event before text counts as `unavailable`; a `model`
  event emitted by a provider is dropped; `switchedFrom` is the last skipped id; exactly one
  terminal event.
- Saved model id: the assistant message stores the id of the answering model, tested through the chat
  service ports with a fake fallback.
- Gemini provider: the SDK retry count is zero and no thinking option is set; a rate limit as a
  thrown error and as an `error` part both map to `rate_limited`.
- Config: `NEXT_COACH_MODEL` is gone from `ServerEnv`; the route builds the list from the constant;
  the smoke script checks each listed model, validates its argument and never prints the key (fake
  `fetch`).
- Manual: for each model of the list, the five-question check above, and one forced fallback by
  temporarily putting an exhausted or invalid first id.

## Open questions

1. Free-tier request and token limits per model are not published in the docs read (the rate-limits
   page points to the AI Studio rate-limit screen of the project). The athlete reads them there.
2. The docs say every model of the list supports function calling, but how reliably each one follows
   the read-only tools is only settled by the manual five-question check per model.
3. The docs read show no free-tier restriction by region (EEA, UK, Switzerland) although an earlier
   page did. The smoke script in the athlete's region settles it.
4. The free tier uses prompts and replies to improve Google's products (stated on the pricing page
   for these models). Already accepted by the athlete for training data (see
   [coach-chat.md](coach-chat.md)).
5. Whether the order should change after the manual per-model check.
6. Google's own pages disagree on how to describe Gemini 3.8 Flash (the models card says
   "previous-generation", its own page says "our most intelligent Flash model") and on which model
   replaces 2.5 Flash Lite. The ranking does not depend on this wording.
