# Coach Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chat with the AI coach on the dashboard that answers from the athlete's own data (races with goals, availability, profile, activities) using Google Gemini behind a provider interface, with saved conversations.

**Architecture:** A new `coach` backend module. A pure `buildCoachContext` puts goals, availability, profile and a computed recent summary in the system prompt on every request; read-only tools (`getRaces`, `getAvailability`, `getActivities`, `getActivity`, `getWeeklySummary`) give the model detail on demand. A streaming route handler `POST /api/coach/chat` runs the model through a `CoachModel` interface (Gemini implementation on the Vercel AI SDK, server side only), saves messages, and streams a small NDJSON wire format to the browser. Conversations live in two new tables; the old report and plan tables are dropped.

**Tech Stack:** Next.js 16 route handler, Effect v4, tRPC 11 (conversation list, messages, delete), Supabase with RLS (`0009`), Vercel AI SDK (`ai` and `@ai-sdk/google`) server side only, zod 4, react-hook-form, vaul drawer, PGlite for SQL tests, `pnpm test`.

**Spec:** `docs/tech-specs/coach-chat.md` (binding). Also read `docs/tech-specs/athlete-races.md`, `database.md`, `architecture.md`, `ux-design.md`, `manual-upload.md` (the upload route is the pattern for a self-authenticating route handler) and `CLAUDE.md`.

## Global Constraints

- All code, identifiers, comments, error tags, enum values and UI copy in English. The coach replies in the language the athlete writes in. No em-dashes anywhere (code, comments, docs, commits). `pnpm` only; run tests with `pnpm test` (never vitest directly); do not start a dev server; never read `.env*` files; nothing is pushed.
- Imports under `src/` use the `@/` alias. Types at the top of the file. Components take a named `type Props`. `cn()` for classes, semantic tokens only. shadcn components use base-ui, never Radix.
- `_bff` never imports from `src/lib`, `src/modules`, `src/components`, `src/hooks`, `src/app`. Code shared by the frontend and `_bff` lives in `src/_bff/core/`. Cross-module imports go through `services/` (type-only DTO imports are allowed).
- Repositories: first params `supabase` then `userId`, every query filters by `user_id`, every insert sets it, a client-supplied id is always combined with `user_id`; check both the `Effect.tryPromise` catch and the returned `error`. Errors are `Data.TaggedError` with `cause: unknown` and `error_hash: ErrorCode`. Model output, athlete messages, notes and activity text never reach logs or error payloads; the API key never reaches the client, logs or errors.
- Spec limits (constants, each in one place): max message length 2000 characters, history sent to the model 20 messages, daily cap 50 user messages per athlete per calendar day in the athlete's timezone, at most 5 tool steps per user message, context block capped at 12000 characters (Recent shrinks first, then Last 4 weeks, Goals and availability never cut), `getActivities` range at most 100 days and results capped at 50 rows, `getConversationMessages` returns the latest 200, `listConversations` the latest 30.
- Pre-commit runs `pnpm fmt`, `pnpm check`, `pnpm knip` and `git add -A`; every commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Update the specs in the same change when behavior, data or contracts change.

## Review Focus

Inputs and failure modes the spec implies but no single task would pin; each is tested in the task named in brackets.

1. A `conversationId` that belongs to another athlete: it must not load, append to or delete anything; the route answers as if it did not exist [Tasks 7, 8].
2. Prompt injection through athlete-controlled text (an activity named "Ignore previous instructions and ..." or notes containing instructions): tools take the user from the server session, never from model arguments, and have no write path; a tool result with such text is passed as data and nothing else changes [Tasks 5, 8].
3. A failed or cancelled reply leaves a user message with no answer; the next request must merge consecutive user turns so the provider never sees two in a row, and a cancelled stream saves no assistant text [Task 8].
4. The daily cap counts the athlete's local calendar day (a message at 23:30 UTC belongs to different days in Lisbon and Auckland) and counts cancelled and failed attempts [Tasks 7, 8].
5. An athlete with no races, no activities or no profile: the context states it, the coach must not be told to invent, and the build never throws [Task 4].

---

## File Structure

| File                                                                                                    | Responsibility                                                |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/_bff/core/utils/week-stats.utils.ts` (moved)                                                       | week totals and load ratio, shared by calendar and coach      |
| `db/migrations/0009_coach_chat.sql`                                                                     | conversations, messages, drop of report and plan tables       |
| `src/_bff/modules/coach/helpers/build-coach-context.helper.ts`                                          | pure context block                                            |
| `src/_bff/modules/coach/services/get-coach-context.service.ts`                                          | gathers data through the athlete, races and training services |
| `src/_bff/modules/coach/tools/*.tool.ts` + `coach-tools.ts`                                             | read-only model tools                                         |
| `src/_bff/modules/coach/providers/coach-model.ts`, `gemini-coach-model.ts`                              | provider interface and Gemini implementation                  |
| `src/_bff/modules/coach/repositories/coach-conversations.repository.ts`, `coach-messages.repository.ts` | persistence                                                   |
| `src/_bff/modules/coach/services/*.service.ts`, `controllers/*.controller.ts`, `coach.router.ts`        | conversation API and the chat service                         |
| `src/_bff/modules/coach/helpers/chat-handler.helper.ts`, `src/app/api/coach/chat/route.ts`              | streaming route                                               |
| `src/modules/coach/*`                                                                                   | chat panel, hook, history menu                                |
| `tools/gemini-smoke.ts`                                                                                 | one-call check of the Gemini key (run by the athlete)         |

---

### Task 1: Dependencies, env, Gemini smoke script, Trigger.dev removal

**Files:**

- Modify: `package.json` (add `ai`, `@ai-sdk/google`; remove `@trigger.dev/sdk` and the `trigger:dev` and `trigger:deploy` scripts), `src/env/server.ts`, `knip.json`, `docs/tech-specs/architecture.md` (env table, jobs section)
- Create: `tools/gemini-smoke.ts`, `tools/__tests__/gemini-smoke.test.ts`
- Delete: `trigger.config.ts`, `src/app/api/cron` if it exists

**Interfaces:**

- Produces: `ServerEnv.NEXT_GEMINI_API_KEY` and `ServerEnv.NEXT_COACH_MODEL` (both optional strings, `emptyStringAsUndefined` stays); `NEXT_ANTHROPIC_AI_KEY`, `NEXT_CRON_SECRET` and `TRIGGER_SECRET_KEY` are removed. `runGeminiSmoke(options: { apiKey: string | undefined; model: string | undefined; fetch?: typeof fetch }): Promise<'ok' | { status: number | 'no-key' | 'network' }>` in `tools/gemini-smoke.ts`; the script's `main` reads the two variables from `process.env` and prints only `OK` or the status code, never the key, the response body or the prompt text.

- [ ] **Step 1: Write the failing test** `gemini-smoke.test.ts` with a fake `fetch`: a 200 gives `'ok'`; a 429, 403 and 400 give `{ status }`; a thrown fetch gives `{ status: 'network' }`; a missing key gives `{ status: 'no-key' }` without calling fetch; the request goes to the Google generative language endpoint with the key in a header (not the URL) and the model name from the argument; assert the key string never appears in the returned value.
- [ ] **Step 2: Run `pnpm test`.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `runGeminiSmoke` (one non-streaming `generateContent` call with a tiny prompt, using plain `fetch`, no SDK, so the check is independent of the library) and the `main` entry. Add `tools/gemini-smoke.ts` to `knip.json` `entry` (it is run with `pnpm dlx tsx tools/gemini-smoke.ts`).
- [ ] **Step 4: Dependencies and env.** `pnpm add ai @ai-sdk/google` (check each package's current version, license and that it imports under Node in a Next.js route handler; record the versions in the commit message). Edit `src/env/server.ts` as above (also remove them from `runtimeEnv`). Remove `@trigger.dev/sdk`, the two `trigger:*` scripts, `trigger.config.ts`, and its `knip.json` entry; delete the cron route directory if present. Update the env table and the jobs section of `architecture.md` (no jobs remain; the Gemini variables).
- [ ] **Step 5: Run `pnpm fmt && pnpm test && pnpm check && pnpm knip`.** `ai` and `@ai-sdk/google` are not imported yet: if knip rejects them, add them in Task 6 instead and say so in the report.
- [ ] **Step 6: Commit** `feat: gemini smoke check, coach env and trigger removal`. In the final message list the human step: the athlete runs `pnpm dlx tsx tools/gemini-smoke.ts` with the variables loaded in the shell and reports `OK` or the status.

---

### Task 2: Move the week math to core

**Files:**

- Create: `src/_bff/core/utils/week-stats.utils.ts`, `src/_bff/core/utils/activity-time.utils.ts`, `src/_bff/core/utils/week-dates.utils.ts` (only the date helpers the moved functions use: `addDays`, week start; leave calendar-only helpers where they are)
- Modify: every importer of the moved code under `src/modules/calendar` and `src/modules/dashboard`; delete the moved originals
- Test: move the existing tests with the code (`src/_bff/core/utils/__tests__/`)

**Interfaces:**

- Produces: `computeTotals(items: CalendarItem[], from: string, to: string): WeekTotals`, `computeLoadRatio(items: CalendarItem[], today: string): number | null`, `loadLabel(ratio: number | null): LoadLabel | null`, `activityDurationS(activity: ActivityDTO): number | null`, with the same behavior as today (ISO weeks start Monday; the athlete timezone is applied by callers through `local_date`).

- [ ] **Step 1: Move the existing tests first** to the new paths with updated imports (they fail: modules missing).
- [ ] **Step 2: Run `pnpm test`.** Expected: FAIL.
- [ ] **Step 3: Move the implementations** to the new files with no behavior change (git mv), update imports in the calendar and dashboard modules, delete the old files.
- [ ] **Step 4: Run `pnpm test && pnpm check && pnpm knip`.** Expected: PASS, with the calendar and week strip tests unchanged apart from import paths.
- [ ] **Step 5: Commit** `refactor: share week stats through core utils`.

---

### Task 3: Migration `0009`: conversations, messages, drop reports and plan

**Files:**

- Create: `db/migrations/0009_coach_chat.sql`
- Modify: `db/tests/schema.test.ts`, `db/tests/rls.test.ts`, `db/tests/tenant-isolation.test.ts`, `db/tests/helpers/fixtures.ts`, `db/README.md`, `docs/tech-specs/database.md`

**Interfaces:**

- Produces: tables `roxcoach.coach_conversations` (`id`, `user_id`, `title`, `created_at`, `updated_at`; `unique (id, user_id)`; index `(user_id, updated_at desc)`) and `roxcoach.coach_messages` (`id`, `user_id`, `conversation_id`, `role` check in `user`, `assistant`, `content` not null, `model` null, `prompt_tokens` null, `completion_tokens` null, `created_at`; composite foreign key `(conversation_id, user_id)` to `coach_conversations` `on delete cascade`; index `(conversation_id, created_at)`). Both follow the `0006` owner policy per operation with `roxcoach.has_access()` and the standard grants and `set_updated_at` trigger where rows are edited.

- [ ] **Step 1: Extend the DB suites (they fail).** Add the two tables to the table lists, the migration to the recorded list, fixtures for both (a message needs a conversation), and tests: `rejects a role outside user and assistant`, `rejects a message that points at another user's conversation` (composite key), `deleting a conversation deletes its messages`, and that `weekly_reports`, `planned_sessions`, `report_status` and `planned_session_status` no longer exist.
- [ ] **Step 2: Run `pnpm test`.** Expected: DB suites FAIL.
- [ ] **Step 3: Write `0009_coach_chat.sql`** in the house style (`begin;` first, the `schema_migrations` insert last, `commit;`). Drop `planned_sessions` first (it references `weekly_reports`), then `weekly_reports`, then the two enum types. Remove the dropped tables from the fixtures builders and table lists that still name them.
- [ ] **Step 4: Run `pnpm test`.** Expected: PASS. Update `db/README.md` (migration list, checklist counts) and `database.md` (new tables, migration row, the dropped tables).
- [ ] **Step 5: Commit** `feat: coach conversations and messages tables`. The migration is applied by the athlete in the Supabase SQL editor; say so in the report.

---

### Task 4: Coach context builder

**Files:**

- Create: `src/_bff/modules/coach/helpers/build-coach-context.helper.ts`, `src/_bff/modules/coach/types/index.ts`, `src/_bff/modules/coach/constants/index.ts` (the limits from Global Constraints)
- Test: `src/_bff/modules/coach/helpers/__tests__/build-coach-context.helper.test.ts`

**Interfaces:**

- Consumes: `computeTotals`, `computeLoadRatio`, `loadLabel` (Task 2); `formatDuration`, `formatClock`, `formatKm`, `formatPace` from `@/_bff/core/utils/formatters.utils`; the existing DTO types of `athlete`, `races` and `training` (type-only imports).
- Produces: `type CoachContextInput = { today: string; timezone: string; profile: ProfileDTO | null; availability: AvailabilitySlotDTO[]; races: RaceDTO[]; activities: ActivityDTO[] }` (activities from the last 35 days, newest data supplied by the caller) and `buildCoachContext(input: CoachContextInput, maxChars?: number): string`.

- [ ] **Step 1: Write the failing golden-text tests** with exact expected sections: a full athlete (profile limits and notes, no name; two upcoming races ordered by date with days to go and `h:mm:ss` targets; availability per weekday; four weeks of totals with the load ratio and its label; the ten most recent activities with pace or distance and effort); no races ("No upcoming races." and nothing invented); no profile; no activities; completed and cancelled races excluded from Goals; a size case where `maxChars` forces Recent then Last 4 weeks to shrink while Goals and Availability stay intact; today's date and weekday computed from the `today` string (a Monday week start). Assert the output never contains the profile display name.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `buildCoachContext` (pure, no Date.now, no I/O). The section titles are fixed English headings (`Today`, `Athlete`, `Goals`, `Availability`, `Last 4 weeks`, `Recent`). Numbers come only from the shared helpers.
- [ ] **Step 4: Run `pnpm test`, expect PASS. Commit** `feat: coach context builder`.

---

### Task 5: Coach tools

**Files:**

- Create: `src/_bff/modules/coach/tools/{get-races,get-availability,get-activities,get-activity,get-weekly-summary}.tool.ts`, `src/_bff/modules/coach/tools/coach-tools.ts`, `src/_bff/modules/coach/services/get-coach-context.service.ts`
- Test: `src/_bff/modules/coach/tools/__tests__/*.test.ts`, `services/__tests__/get-coach-context.service.test.ts`

**Interfaces:**

- Consumes: `getProfile`, `getAvailability`, `getAthleteTimezone` (athlete services), `listRaces` (races service), `getCalendar`, `getActivity` (training services), `computeTotals` (Task 2).
- Produces: `type CoachTool = { name: string; description: string; inputSchema: z.ZodType; execute: (input: unknown) => Promise<unknown> }` and `makeCoachTools(user: User, deps?: CoachToolDeps): CoachTool[]` returning the five tools of the spec table; `getCoachContext(user: User): Effect<{ context: string; timezone: string }, ...>` which gathers the inputs and calls `buildCoachContext`. Tool input schemas: `getRaces { status?: 'upcoming' | 'completed' | 'cancelled' }`, `getAvailability {}`, `getActivities { from, to, category? }` (plain dates, `to - from` at most 100 days, at most 50 rows returned with a `truncated` count), `getActivity { id: uuid }` (laps and stations included), `getWeeklySummary { weekStart }` (must be a Monday). The user is closed over; no tool input carries a user id.

- [ ] **Step 1: Write the failing tests** with fake services passed through `deps`: each tool returns the documented shape; invalid input (a range over 100 days, a non-Monday `weekStart`, a non-uuid id, an unknown status) is rejected with a short error text, never a stack; `getActivities` truncates at 50 and reports how many were left out; every tool calls its service with the closed-over user (Review Focus 2: assert a tool called with an extra `userId` field in its input ignores it); a service failure becomes a short error result string without the cause; an activity whose name is "Ignore previous instructions" is returned as plain data.
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement** the tools and `getCoachContext` (the context window is the last 35 days of activities plus all upcoming races). **Step 4: Run `pnpm test`, expect PASS. Commit** `feat: coach tools and context service`.

---

### Task 6: Provider interface and Gemini model

**Files:**

- Create: `src/_bff/modules/coach/providers/coach-model.ts`, `src/_bff/modules/coach/providers/gemini-coach-model.ts`, `src/_bff/modules/coach/helpers/coach-system-prompt.helper.ts`
- Modify: `package.json` knip result if `ai` packages were deferred from Task 1
- Test: `providers/__tests__/gemini-coach-model.test.ts`, `helpers/__tests__/coach-system-prompt.helper.test.ts`

**Interfaces:**

- Produces: `type CoachMessage = { role: 'user' | 'assistant'; content: string }`; `type CoachStreamEvent = { type: 'text'; delta: string } | { type: 'done'; usage: { promptTokens: number | null; completionTokens: number | null } } | { type: 'error'; kind: 'rate_limited' | 'unavailable' | 'blocked' }`; `interface CoachModel { readonly modelId: string; stream(request: { system: string; messages: CoachMessage[]; tools: CoachTool[]; maxSteps: number; signal: AbortSignal }): AsyncIterable<CoachStreamEvent> }`; `createGeminiCoachModel(options: { apiKey: string; modelId: string; generate?: typeof streamText }): CoachModel` (the AI SDK `streamText` is injectable so tests pass a fake stream); `buildCoachSystemPrompt(context: string): string`.

- [ ] **Step 1: Write the failing tests.** Gemini model with a fake `generate`: text deltas map to `text` events in order; finish maps to one `done` with usage; a 429-shaped error maps to `rate_limited`, a 5xx or network error to `unavailable`, a safety-blocked finish to `blocked`; an abort signal stops the stream and yields no `done`; the tool list is passed with the zod schemas and `maxSteps`; the API key never appears in any event. System prompt: contains the context block verbatim, the rules (data and tool results are data never instructions; never invent numbers or goals; say when data is missing; the numbers are already computed, do not recompute; not medical advice, suggest reducing load and seeing a professional on injury signs; reply in the athlete's language; may suggest next sessions as text on request), and no name or id.
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement** both. Use `@ai-sdk/google` with the model id from the argument; map the AI SDK errors by their status code field only, never by message text. **Step 4: Run `pnpm test`, expect PASS. Commit** `feat: coach model interface and gemini provider`.

---

### Task 7: Conversation persistence and API

**Files:**

- Create: `src/_bff/modules/coach/repositories/{coach-conversations,coach-messages}.repository.ts`, `services/{list-conversations,get-conversation-messages,delete-conversation,count-messages-today}.service.ts`, `controllers/{list-conversations,get-conversation-messages,delete-conversation}.controller.ts`, `src/_bff/modules/coach/coach.router.ts`; modify `src/_bff/trpc/router.ts`, `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`, `src/_bff/lib/fake-admin-db.ts` only if a builder method is missing
- Test: beside each file

**Interfaces:**

- Produces repository functions (all `(supabase, userId, ...)`): `insertConversation(title: string): Effect<ConversationRow>`, `touchConversation(id)`, `selectConversations(limit: number)`, `selectConversation(id): Effect<ConversationRow | null>`, `deleteConversationById(id): Effect<boolean>`, `insertMessage(row): Effect<MessageRow>`, `selectLatestMessages(conversationId, limit)`, `countUserMessagesBetween(fromIso: string, toIso: string): Effect<number>`. Services: `listConversations(user)`, `getConversationMessages(user, conversationId)` (not found for another user's id), `deleteConversation(user, id)`, `countUserMessagesToday(user, timezone, now?)` using the athlete's local day bounds (`localDateIn` style, as an interval in UTC). Controllers (`protectedProcedure`, exhaustive `Match.tag`): `coach.listConversations`, `coach.getConversationMessages { conversationId: uuid }`, `coach.deleteConversation { conversationId: uuid }`. DTOs: `ConversationDTO { id, title, updatedAt }`, `MessageDTO { id, role, content, createdAt }`.

- [ ] **Step 1: Write the failing tests** (fake db, two-user fakes as in the races repository tests): every query filters by `user_id` and combines the id with it; another user's conversation id yields null, empty and `false` (Review Focus 1); message ordering ascending, latest 200 and latest 30 limits applied; `countUserMessagesToday` for `Europe/Lisbon` and `Pacific/Auckland` at `2026-11-20T23:30:00Z` uses different day bounds (Review Focus 4); both error branches of every repository call; controllers use `protectedProcedure`, never map `UnauthenticatedError` or `GetUserError`, and strip `cause`.
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement.** **Step 4: Run `pnpm test`, expect PASS. Commit** `feat: coach conversations api`.

---

### Task 8: Chat service and streaming route

**Files:**

- Create: `src/_bff/modules/coach/services/send-coach-message.service.ts`, `src/_bff/modules/coach/helpers/build-history.helper.ts`, `src/_bff/modules/coach/helpers/chat-handler.helper.ts`, `src/app/api/coach/chat/route.ts`
- Test: beside each file

**Interfaces:**

- Consumes: Tasks 4 to 7 (`getCoachContext`, `makeCoachTools`, `CoachModel`, repositories, `countUserMessagesToday`, `buildCoachSystemPrompt`), `getSession`, `hasRoxcoachAccess`.
- Produces: `buildHistory(messages: MessageRow[]): CoachMessage[]` (last 20, consecutive user messages merged into one turn joined by a blank line, a trailing assistant message is kept, order preserved); `sendCoachMessage(user, input: { conversationId: string | null; message: string }, deps: { model: CoachModel; now?: Date; signal: AbortSignal }): Effect<AsyncIterable<ChatEvent>, ...>` where the wire events are `ChatEvent = { type: 'meta'; conversationId: string } | { type: 'text'; delta: string } | { type: 'done' } | { type: 'error'; kind: 'rate_limited' | 'unavailable' | 'blocked' | 'daily_cap' }`; `createChatHandler(deps)` returning `(request: Request) => Promise<Response>`; the route file exports only `POST` (and `maxDuration`). Response: `200` with `application/x-ndjson` (one JSON event per line); before streaming: 401 no user, 403 no access flag, 422 bad body or message over 2000 characters or empty, 404 `conversationId` of another athlete, 429 daily cap (`{ error }`), 503 when `NEXT_GEMINI_API_KEY` is not set. Fixed English messages, never the model text or the cause.

- [ ] **Step 1: Write the failing tests.** `buildHistory`: merges consecutive user turns, windows to 20, empty input; the handler with fakes: 401 and 403 before reading the body; empty and over-long messages 422; another user's `conversationId` 404 and nothing is written (Review Focus 1); a new conversation is created with the first message (truncated to 60 characters) as title; the user message is saved on arrival; text deltas stream in order as NDJSON after a `meta` event; on `done` the assistant text and usage are saved once; a cancelled request (abort signal) saves the user message and no assistant message, and a partial reply is never saved (Review Focus 3); a provider `rate_limited` or `unavailable` event yields an error event and no assistant message, and the next request merges the orphan user turn into one (Review Focus 3); the 51st message of the athlete's local day is refused with 429 before any model call, and cancelled or failed attempts count (Review Focus 4); a tool result containing instruction-like text does not change the system prompt or the tool list the model receives (Review Focus 2); the response never contains the API key, the system prompt or the athlete's other conversations.
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement.** Run the model with the tools and `maxSteps: 5`; read the Gemini key and model id only from `ServerEnv` in `route.ts`, never inside helpers (they receive the model). `Effect.runPromiseExit` at the seam; defects log tag and `error_hash` only. **Step 4: Run `pnpm test`, expect PASS. Commit** `feat: coach chat route`.

---

### Task 9: Chat panel on the dashboard, remove Coach and Plan routes

**Files:**

- Create: `src/modules/coach/{coach-chat.tsx,coach-chat-view.tsx,use-coach-chat.ts,coach-history-menu.tsx,coach-message.tsx,suggestions.ts}`
- Modify: `src/modules/dashboard/dashboard-content.tsx` (mount the chat), `src/components/app-shell.tsx` (remove the `/coach` and `/plan` entries), `docs/tech-specs/ux-design.md`; add `react-markdown` (check version, license; no raw HTML rendering)
- Delete: `src/app/(app)/coach/`, `src/app/(app)/plan/`
- Test: beside each new file

**Interfaces:**

- Consumes: `POST /api/coach/chat` (NDJSON events of Task 8), `trpcClient.coach.listConversations`, `getConversationMessages`, `deleteConversation`.
- Produces: `useCoachChat(options?: { send?: (body: { conversationId: string | null; message: string }, signal: AbortSignal) => Promise<Response> })` returning `{ messages, status: 'idle' | 'loading-history' | 'streaming' | 'error' | 'limit', errorKind, conversationId, sendMessage(text), stop(), newConversation(), openConversation(id), retry() }`; `CoachChatView` (presentational: props `{ open, onOpenChange, messages, status, errorKind, conversations, onSend, onStop, onNew, onOpen, onDelete, chips }`); suggestion chips constants "How is my training going?", "Am I on track for my next race?", "What should I do this week?".

- [ ] **Step 1: Write the failing tests** (jsdom, test ids only, fakes through the hook option, no module mocks of app code): the launcher bar opens the panel; greeting and the three chips shown when empty and a chip sends its text; sending streams text into one assistant bubble, the send button is disabled while streaming and a stop button aborts (the partial text is marked "incomplete" and the typed text stays editable); a `daily_cap` event shows "You reached today's message limit"; `rate_limited` and `unavailable` show "The coach is busy, try again in a minute" with a retry that resends the same text; the history menu lists conversations, opens one (loads its messages), starts a new one and deletes one after an inline confirmation; assistant text renders markdown (paragraphs, lists, bold) and a raw `<script>` or HTML tag in the model text is shown as text; the panel is a full-height drawer on narrow screens and a fixed bottom-right panel otherwise; no microphone control exists. Hook tests: NDJSON parsing across arbitrary chunk boundaries (an event split between two chunks), an unknown event type ignored, a non-200 response maps 429 to `limit`, 401 and 403 to a sign-in message, 5xx to `error`.
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement** with the existing drawer, button, input and the project design tokens; the chat is a client island inside the async `DashboardContent`; after the first assistant reply invalidate `coach.listConversations`. Remove the two routes and their nav entries and any now-dead placeholder component. **Step 4: Run `pnpm test && pnpm check && pnpm knip`. Commit** `feat: coach chat panel`.
- [ ] **Step 5 (human):** no visual verification is possible in this environment; the final message lists what the athlete should check in the browser.

---

### Task 10: Docs: replace the report and plan specs

**Files:**

- Modify: `docs/tech-specs/coach-chat.md` (status: implemented; align every statement with the code), `docs/tech-specs/README.md` (index and build order), `architecture.md` (module table, tRPC namespaces `auth`, `athlete`, `races`, `training`, `coach`, non-tRPC entry points with `/api/coach/chat`, env table), `ux-design.md`, `database.md`, `README.md` (a short "Coach chat" setup note: set `NEXT_GEMINI_API_KEY` and `NEXT_COACH_MODEL`, run the smoke script, apply `0009`)
- Delete: `docs/tech-specs/coach.md`, `docs/tech-specs/plan.md`

- [ ] **Step 1: Update and delete** as listed; every statement is checked against the code on disk (route statuses and messages, constants, wire format, tool names and limits, table columns, env variables). Fix any remaining reference to the weekly report, the cron job, the stored plan, Anthropic or Trigger.dev in docs.
- [ ] **Step 2: Run `pnpm fmt && pnpm test && pnpm check && pnpm knip`.**
- [ ] **Step 3: Human checklist in the final message:** run the Gemini smoke script; apply `0009` in the SQL editor; ask five real questions against real data (goal check, last long run, week comparison, a Hyrox session with stations, a question with no data) and read the answers; confirm the free tier terms for the region.
- [ ] **Step 4: Commit** `docs: coach chat specs`.
