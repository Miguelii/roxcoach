# Coach Model Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The coach chat runs on a fixed, ordered list of Gemini free-tier models and retries the same request on the next model when one is rate limited, showing the answering model in a caption under the message box and a short note in the conversation when a switch happened.

**Architecture:** A `createFallbackCoachModel(models)` wrapper is itself a `CoachModel`, so the chat handler, the service and the tools keep receiving one model. It emits a new `model` stream event when a model is committed to a reply (before its first `text`), and the chat service saves the id of the model that really answered. The wire format (NDJSON) gets one new `model` event and `MessageDTO` gets `model`. The UI shows a caption and an in-session switch note. The model list is a constant in `src/_bff/core/constants` (importable by the client for the friendly names); `NEXT_COACH_MODEL` disappears.

**Tech Stack:** Effect v4 services, Vercel AI SDK (server side, already installed), zod 4, React 19, react-hook-form, `pnpm test`.

**Spec:** `docs/tech-specs/coach-model-fallback.md` (binding). Also read `docs/tech-specs/coach-chat.md` (the chat it extends: wire format, handler, service, panel) and `CLAUDE.md`.

## Global Constraints

- All code, identifiers, comments, error tags, enum values and UI copy in English. No em-dashes anywhere (code, comments, docs, commits). `pnpm` only; run tests with `pnpm test` (never vitest directly); do not start a dev server; never read `.env*` files; nothing is pushed.
- Imports under `src/` use the `@/` alias. Types at the top of the file. Components take a named `type Props`. `cn()` for classes, semantic tokens only. shadcn components use base-ui, never Radix.
- `_bff` never imports from `src/lib`, `src/modules`, `src/components`, `src/hooks`, `src/app`. Code shared by the frontend and `_bff` lives in `src/_bff/core/`.
- Model output, athlete text and the API key never reach logs or error payloads. The only new log line is tag `CoachModelFallback` plus the failed model id and the failure kind (ids are not secrets).
- Model ids, exact and in this order (best first): `gemini-4-hydrogen`, `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3-flash-preview`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`. Friendly names: Gemini 4 Hydrogen, Gemini 3.8 Flash, Gemini 3.6 Flash, Gemini 3 Flash, Gemini 3.5 Flash Lite, Gemini 3.1 Flash Lite, Gemini 2.5 Flash Lite. `gemini-2.5-flash` is deprecated and not in the list. Never request the `minimal` thinking level (Gemini 3.8 Flash errors on it).
- Switch only on `rate_limited` or `unavailable` and only when NO text of the reply was emitted yet; never on `blocked`; never after any text; abort stops the chain. All models fail without text: one `error` event, kind `rate_limited` only when every failure was a rate limit, otherwise `unavailable`.
- Pre-commit runs `pnpm fmt`, `pnpm check`, `pnpm knip` and `git add -A`; every commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Update the specs in the same change when behavior, data or contracts change.

## Review Focus

Inputs and failure modes the spec implies but no single task would pin; each is tested in the task named in brackets.

1. A model that fails AFTER it streamed some text must not trigger a switch (the athlete would get a duplicated or incoherent answer); the failure is passed through unchanged [Task 2].
2. An abort while the chain is running (before the first model answers, between models, or mid-stream) stops everything: no further model is started, no `done`, no `error`, and no assistant message is saved [Tasks 2, 3].
3. The saved `coach_messages.model` is the model that actually answered (not the first of the list, and not the wrapper), and nothing is saved when every model failed [Task 3].
4. A model whose stream throws, or ends without a terminal event, before any text counts as `unavailable` and the chain continues; the chain never crashes the response and always ends with exactly one terminal event [Task 2].
5. Old messages saved before this change have `model` null, and an unknown model id (a list change later): the UI must not crash, the caption shows nothing for null and the raw id for an unknown id [Task 5].

---

## File Structure

| File                                                                                 | Responsibility                                                            |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/_bff/core/constants/coach-models.constants.ts`                                  | `COACH_MODELS` (ordered ids and friendly names) and `coachModelLabel(id)` |
| `src/_bff/modules/coach/providers/fallback-coach-model.ts`                           | `createFallbackCoachModel(models, options?)`                              |
| `src/_bff/modules/coach/providers/coach-model.ts`, `gemini-coach-model.ts`           | new `model` event; SDK retries off                                        |
| `src/_bff/modules/coach/services/send-coach-message.service.ts`                      | forwards the `model` event, saves the answering model                     |
| `src/_bff/modules/coach/repositories/coach-messages.repository.ts`, `types/index.ts` | `MessageDTO.model`                                                        |
| `src/app/api/coach/chat/route.ts`, `src/env/server.ts`                               | builds the list; `NEXT_COACH_MODEL` removed                               |
| `tools/gemini-smoke.ts`                                                              | checks one id or every listed model                                       |
| `src/modules/coach/*`                                                                | caption, switch note, parser                                              |

---

### Task 1: Model list constant and the smoke script

**Files:**

- Create: `src/_bff/core/constants/coach-models.constants.ts`, `src/_bff/core/constants/__tests__/coach-models.constants.test.ts`
- Modify: `tools/gemini-smoke.ts`, `tools/__tests__/gemini-smoke.test.ts`

**Interfaces:**

- Produces: `COACH_MODELS: ReadonlyArray<{ id: string; label: string }>` in the order of Global Constraints; `coachModelLabel(id: string): string` (the label of a listed id, otherwise the raw id). `runGeminiSmoke` keeps its signature and result type; the script's `main` takes an optional model id argument (`process.argv[2]`): with an argument it checks that id, without one it checks every `COACH_MODELS` id in order, printing one line per model: `<id>: OK` or `<id>: <status>` (a status number, `no-key` or `network`), never the key, a response body or a prompt.

- [ ] **Step 1: Write the failing tests.** Constants: the exact seven ids in the exact order; ids unique; every entry has a non-empty label; `gemini-2.5-flash` is absent; `coachModelLabel('gemini-3.8-flash')` is `Gemini 3.8 Flash`; an unknown id returns the id unchanged; the constant has no duplicated labels. Smoke: with a fake `fetch`, no argument checks all seven ids in order and prints one line each; an argument checks only that id; a 429 for one id and 200 for another print their own lines; a missing key prints `no-key` per model without calling fetch; the key never appears in any printed line; the printed output goes through an injectable `print` function so the test captures it.
- [ ] **Step 2: Run `pnpm test`.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the constant (core file, no `server-only`, client-importable) and change the script's `main` to loop over the list with the existing `runGeminiSmoke`. Remove `DEFAULT_SMOKE_MODEL` and every read of `NEXT_COACH_MODEL` from the script (the id now comes from the argument or the list). Keep the script's own `loadEnvConfig` inside `main()`.
- [ ] **Step 4: Run `pnpm fmt && pnpm test && pnpm check && pnpm knip`.** `COACH_MODELS` is not consumed by app code until Task 4: knip counts tests as usage, so this passes. Commit `feat: coach model list and per-model smoke check`.

---

### Task 2: The fallback model and the provider changes

**Files:**

- Create: `src/_bff/modules/coach/providers/fallback-coach-model.ts`, `providers/__tests__/fallback-coach-model.test.ts`
- Modify: `src/_bff/modules/coach/providers/coach-model.ts`, `gemini-coach-model.ts`, `providers/__tests__/gemini-coach-model.test.ts`

**Interfaces:**

- Consumes: `CoachModel`, `CoachModelRequest`, `CoachStreamEvent` (existing, same files).
- Produces: `CoachStreamEvent` gains `{ type: 'model'; modelId: string; switchedFrom: string | null }`. `createFallbackCoachModel(models: CoachModel[], options?: { onFallback?: (entry: { modelId: string; kind: 'rate_limited' | 'unavailable' }) => void }): CoachModel` (throws a `RangeError` at construction for an empty list; its `modelId` is the id of the first model). The Gemini model asks the AI SDK for zero automatic retries and never sets a thinking level.

- [ ] **Step 1: Write the failing fallback tests** with fake `CoachModel`s that yield scripted events: first succeeds (the second is never started; a `model` event `{ modelId: first, switchedFrom: null }` precedes the first `text`, then the text, then `done` passes through); first yields `error rate_limited` before text, second succeeds (the second receives the IDENTICAL request object fields: system, messages, tools, maxSteps, signal; the `model` event has `switchedFrom` equal to the first id; `onFallback` is called once with the first id and `rate_limited`; the discarded error is not emitted); `unavailable` before text also falls back; a first model that THROWS before text counts as `unavailable` and falls back; a first model whose stream ends with no terminal event before text counts as `unavailable`; `blocked` is passed through with no second model started (Review Focus 4 is covered by the throw and end-without-terminal cases); once a `text` was emitted a following `error` is passed through and the second model is never started (Review Focus 1); abort: aborting before the call, between models and mid-stream starts no further model and emits no `done` or `error` (Review Focus 2); all three models fail before text gives exactly ONE `error`, kind `rate_limited` when all were rate limited and `unavailable` when kinds are mixed; exactly one terminal event in every case; a single-model list behaves like the plain model plus the `model` event; an empty list throws.
- [ ] **Step 2: Write the failing Gemini tests** (extend the existing file): the request passed to the injected `generate` carries `maxRetries: 0` (confirm the exact option name in the installed `ai` types first and use it), and its options contain no thinking level or provider thinking configuration; the existing mappings still pass.
- [ ] **Step 3: Run `pnpm test`.** Expected: FAIL.
- [ ] **Step 4: Implement** `createFallbackCoachModel` as an async generator over the list: for each model, iterate its stream; buffer nothing; hold back only the `model` event until the model's first `text` (emit `model` immediately before that first `text`, so a model that fails before text never announces itself); remember the last skipped id as `switchedFrom`; classify a throw or a stream that ends with no terminal event before text as `unavailable`. Update the Gemini model for `maxRetries` and tests. Update the `CoachStreamEvent` consumers that switch on `type` so they stay exhaustive (the chat service handles `model` in Task 3; until then it must compile: ignore the event there with a comment, to be replaced in Task 3).
- [ ] **Step 5: Run `pnpm fmt && pnpm test && pnpm check && pnpm knip`.** Commit `feat: coach model fallback`.

---

### Task 3: Service, wire format and message DTO

**Files:**

- Modify: `src/_bff/modules/coach/services/send-coach-message.service.ts`, `src/_bff/modules/coach/types/index.ts`, `src/_bff/modules/coach/repositories/coach-messages.repository.ts` (and the services that build `MessageDTO`), the matching tests, `docs/tech-specs/coach-chat.md` (wire format and `MessageDTO`)

**Interfaces:**

- Consumes: the `model` stream event (Task 2).
- Produces: `ChatEvent` gains `{ type: 'model'; model: string; switchedFrom: string | null }`, emitted right after `meta` is NOT required: it is forwarded when the provider emits it (before the first `text`). `MessageDTO` gains `model: string | null`. The assistant message is saved with the id carried by the last `model` event of the reply (not `model.modelId`).

- [ ] **Step 1: Write the failing tests.** Service with a fake model: a stream `[model m2 (switchedFrom m1), text, done]` yields wire events `meta, model, text, done` in that order and saves the assistant message with `model: m2` (Review Focus 3); a stream with a first `text` and NO `model` event (a plain model) saves with the fake model's own `modelId`; a stream that ends in `error` saves no assistant message and emits no `model` event; an abort mid-stream saves nothing (Review Focus 2) and emits no `done`. Repository: the select returns `model`; `MessageDTO.model` is the column value, null for user messages and for old rows (zod accepts null); the history query still returns user messages with `model: null`. Handler tests: the NDJSON line for the model event is `{"type":"model","model":"...","switchedFrom":null}` (exact keys, one line).
- [ ] **Step 2: Run `pnpm test`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Track `answeredBy` in `streamReply` (initialised to `model.modelId` for providers that emit no `model` event), forward the `model` event as a wire event, pass `answeredBy` to `saveReply`. Add `model` to `MessageDTO` and its repository mapping. Update `coach-chat.md` (the event list and the DTO).
- [ ] **Step 4: Run `pnpm fmt && pnpm test && pnpm check && pnpm knip`.** Commit `feat: coach model event and saved answering model`.

---

### Task 4: Route wiring, environment and docs of the configuration

**Files:**

- Modify: `src/app/api/coach/chat/route.ts`, `src/env/server.ts`, `src/_bff/modules/coach/constants/index.ts` (remove `DEFAULT_COACH_MODEL`), `docs/tech-specs/architecture.md`, `README.md`, `docs/tech-specs/coach-chat.md`, `docs/tech-specs/coach-model-fallback.md` (status), tests that reference `NEXT_COACH_MODEL`

**Interfaces:**

- Consumes: `COACH_MODELS` (Task 1), `createGeminiCoachModel`, `createFallbackCoachModel` (Task 2), `Logger`.
- Produces: the route builds `createFallbackCoachModel(COACH_MODELS.map(({ id }) => createGeminiCoachModel({ apiKey, modelId: id })), { onFallback })` once, where `onFallback` logs `{ level: 'warn', prefix: 'coachModelFallback', metadata: { modelId, kind } }` through the project Logger; `NEXT_GEMINI_API_KEY` is the only coach variable; without the key the handler still answers 503 as today.

- [ ] **Step 1: Write the failing tests.** `ServerEnv` no longer has `NEXT_COACH_MODEL` (a type-level check through the env test if one exists, otherwise a test that the declared keys do not include it); a test of a small pure helper `buildCoachModels(apiKey, factories)` if you extract one for the route (recommended so the list wiring is testable without `ServerEnv`): it builds one Gemini model per listed id in order and wraps them; the logger metadata contains only the model id and the kind (assert the secret key string never appears).
- [ ] **Step 2: Run `pnpm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the route wiring (read `ServerEnv` only in `route.ts`), remove `NEXT_COACH_MODEL` from `src/env/server.ts` (both blocks), remove `DEFAULT_COACH_MODEL`, and fix every doc or comment that names them: architecture env table, README coach setup note (the smoke script now checks every model: `pnpm dlx tsx tools/gemini-smoke.ts`, or one id as an argument), `coach-chat.md` (constants table, provider paragraph, env sections, manual check). Set the fallback spec status to implemented and align any statement with the code.
- [ ] **Step 4: Run `pnpm fmt && pnpm test && pnpm check && pnpm knip`.** Commit `feat: wire the coach model list and drop NEXT_COACH_MODEL`.

---

### Task 5: Caption and switch note in the chat

**Files:**

- Modify: `src/modules/coach/use-coach-chat.ts`, `coach-chat-view.tsx`, `coach-chat.tsx` (if the wrapper maps history DTOs), `coach-message.tsx` if needed, `src/modules/coach/__tests__/*`, `docs/tech-specs/ux-design.md`
- Create (if it keeps files small): `src/modules/coach/coach-model-caption.tsx`, `coach-model-switch-note.tsx` and their tests

**Interfaces:**

- Consumes: the `model` NDJSON event `{ type: 'model', model: string, switchedFrom: string | null }`, `MessageDTO.model`, `coachModelLabel` (Task 1).
- Produces: `useCoachChat` also returns `modelId: string | null` (the model of the latest reply or, in a reopened conversation, of its last assistant message); the message list model gains a non-persisted item for the switch note (for example `{ kind: 'switch-note', from: string, to: string }` placed immediately before the reply that caused it). `CoachModelCaption` (props `{ modelId: string | null }`, test id `coach-model-caption`, renders nothing for null, the friendly name otherwise, the raw id for an unknown id) shown under the message box inside the panel; `CoachModelSwitchNote` (props `{ from: string; to: string }`, test id `coach-model-switch-note`) with the copy "<from label> reached its limit. Answering with <to label>." as muted small centered text, not an alert (no `role="alert"`).

- [ ] **Step 1: Write the failing tests** (jsdom, test ids only, fakes through the hook options, no module mocks of app code): parser accepts the `model` event and ignores unknown types as before; a stream `[meta, model(m1, null), text, done]` sets the caption to the friendly name of m1 and renders no switch note; `[meta, model(m2, switchedFrom m1), text, done]` renders the switch note with both friendly names immediately before the assistant message and sets the caption to m2's name; the caption NEVER contains the switch sentence; the next reply updates the caption and adds a note only if that reply also switched; a new conversation shows no caption; reopening a conversation (history loaded through the existing option) sets the caption to the `model` of the last assistant message, shows no switch note, and a history whose assistant messages all have `model: null` shows no caption and does not crash (Review Focus 5); an unknown model id shows its raw id; an `error` event (all models failed) keeps the last known caption and shows the existing error message; the switch note is not present after `newConversation` and after reopening a conversation; stale `model` events from a superseded request (after `newConversation` or `openConversation`) are ignored like the other events; the note has no `role="alert"` and the live region does not announce it as a separate alert.
- [ ] **Step 2: Run `pnpm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the schema branch and state in the hook, the two small components, the item type in the message list and the caption below the composer in `coach-chat-view.tsx` (inside the panel, below the input and the send button; make sure it fits the narrow mobile panel on one line with ellipsis). Update `ux-design.md` with the caption and the note.
- [ ] **Step 4: Run `pnpm fmt && pnpm test && pnpm check && pnpm knip`.** Commit `feat: coach model caption and switch note`.
- [ ] **Step 5 (human):** no visual verification is possible in this environment; the final message lists what to check in the browser (caption position on mobile and desktop, the note before the reply, dark mode).

---

### Task 6: Final docs check

**Files:**

- Modify: `docs/tech-specs/coach-model-fallback.md`, `docs/tech-specs/coach-chat.md`, `docs/tech-specs/README.md`, `docs/tech-specs/architecture.md`

- [ ] **Step 1: Update and verify.** Set `coach-model-fallback.md` to implemented and make every statement match the code on disk (list, ids, labels, event shape, which cases switch, the single terminal event rule, saved model, what the UI shows, removed variable, smoke script behavior); move resolved items out of Open questions and keep the genuinely open ones (per-model free-tier limits in AI Studio, tool reliability per model, region check, order revisited after the manual check). Grep docs (excluding `docs/plans`) and `README.md` for `NEXT_COACH_MODEL`, `DEFAULT_COACH_MODEL` and `gemini-2.5-flash` and fix each remaining mention.
- [ ] **Step 2: Run `pnpm fmt && pnpm test && pnpm check && pnpm knip`.**
- [ ] **Step 3: Human checklist in the final message:** run `pnpm dlx tsx tools/gemini-smoke.ts` and report which models answer `OK` (remove the ones that do not from `COACH_MODELS`); ask the five real questions per model and note which fail tool calls; force one fallback by temporarily putting an invalid or exhausted id first and confirm the chat answers with the next model, the caption shows it and the note appears; confirm `coach_messages.model` holds the answering id; set the final order.
- [ ] **Step 4: Commit** `docs: coach model fallback specs`.
