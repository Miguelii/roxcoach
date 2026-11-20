# Coach chat

A chat with the AI coach on the dashboard. The athlete asks about their training and goals, and the
coach answers from the data in the app. This replaces the weekly report, the 3-report memory, the
cron job and the stored plan of the earlier coach and plan specs (see "What this replaces").
Status: spec only, nothing is built yet. The athlete has chosen approach C and the answers in
"Decisions" below; see "Open questions" for the two items that still need the athlete.

## Intent

The athlete already has an assistant (Claude with the Strava connector) that answers questions
about workouts. Roxcoach is worth keeping only if its coach knows what that assistant does not:
the athlete's races with target times, the weekly availability, Hyrox laps and stations, and the
notes the athlete entered by hand. The chat is how that knowledge is used.

## Goals

- Ask the coach anything about training in natural language and get an answer grounded in the
  athlete's data, in the language the athlete writes in.
- The coach always knows the athlete's goals (races and target times), availability and recent
  training without being asked.
- The coach can look up older or detailed data (a specific workout, a period, a week) on its own.
- Conversations are saved and can be resumed.
- Free to run: Google Gemini free tier, behind a provider interface so the model can be changed.

## Non-goals and anti-goals

- No weekly report, no Sunday job, no memory of past reports, no stored plan, no `/plan` page.
  The coach may suggest next sessions in the chat when asked, as text only.
- The coach never changes data: it has read-only tools. Creating races, availability and uploads
  stays in the screens that exist for that.
- No voice input, no file uploads in the chat, no image input.
- Not a medical tool. Anti-goal: an answer that invents numbers or goals the data does not
  contain. When data is missing the coach says so.
- Not sending identity to the model: no name, no email, no user id.

## Approaches considered

| Approach                                                          | Trade-off                                                                                   | Decision                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------- |
| A. Whole history in every prompt                                  | simplest, but cost and latency grow with history and the free tier limits tokens per minute | rejected                  |
| B. Tools only                                                     | precise and scalable, but the model may skip the goals tool and answer without them         | rejected                  |
| C. Hybrid: compact context always in the prompt, tools for detail | goals are never missed, typical answers need one model call                                 | **chosen by the athlete** |
| D. Embeddings and retrieval                                       | needs unstructured text at scale, which this data is not                                    | rejected                  |

## How the model gets the data

Two channels, both built on the existing services of `athlete`, `races` and `training`.

### 1. Context block (always sent)

A pure function `buildCoachContext(input): string` in the `coach` module builds one text block that
goes into the system prompt on every request. Everything numeric is computed in code and the model
is told not to recompute it. Sections, in this order:

| Section      | Content                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| Today        | today's date and weekday in the athlete's timezone, the timezone                                                |
| Athlete      | max and resting heart rate, Hyrox division, weekly hours cap, free-text notes (injuries, limits). No name       |
| Goals        | every `upcoming` race by date: name, type, date, days to go, target time, priority, distance or division, notes |
| Availability | the typical week: per weekday the slots, fixed or open, max minutes                                             |
| Last 4 weeks | per ISO week: total time, session count, run km, and the acute to chronic load ratio for the latest week        |
| Recent       | the last 10 activities: date, name, category, distance, time, average heart rate, perceived effort              |

The block has a size cap (a constant, about 3000 tokens as a starting point). When it would exceed
the cap, the Recent list shrinks first, then the Last 4 weeks list. Goals and availability are never
cut. The week totals and load ratio reuse the logic that exists today in
`src/modules/calendar/week-stats.ts` (`computeTotals`, `computeLoadRatio`). That logic is a frontend
file and `_bff` may not import from `src/modules`, so it moves to `src/_bff/core/utils/` (shared
code rule) and the calendar imports it from there.

### 2. Tools (called by the model when it needs detail)

Read-only functions, executed on the server for the signed-in user only. Each has a zod input
schema and returns plain JSON with the same field names as the app's types.

| Tool               | Input                                                            | Returns                             |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------- |
| `getRaces`         | `status?` (`upcoming`, `completed`, `cancelled`)                 | races with goals and results        |
| `getAvailability`  | none                                                             | the weekly slots                    |
| `getActivities`    | `from`, `to` (plain `YYYY-MM-DD`, at most 100 days), `category?` | activities in the range             |
| `getActivity`      | `id`                                                             | one activity with laps and stations |
| `getWeeklySummary` | `weekStart` (a Monday, `YYYY-MM-DD`)                             | totals for that week                |

Limits: at most 5 tool steps per user message, each result capped in size (rows beyond the cap are
dropped and the result says how many were left out). A tool failure is returned to the model as a
short error text so it can tell the athlete, never as a stack trace.

## Provider interface

The `coach` module talks to the model only through its own interface, so the Gemini free tier can
later be replaced without touching the chat, the tools or the persistence.

`CoachModel`: given the system prompt, the message history, the tool definitions and an abort
signal, it returns a stream of text deltas and finished tool calls, and reports token usage. A
`GeminiCoachModel` implements it. Tests use a fake. Which library implements the streaming and
the tool loop (the official Google SDK or the Vercel AI SDK with its Google provider) is the
builder's call, decided by how cleanly it fits an Effect-based backend and a streaming route
handler. Versions and the model id are checked at plan time. The model id is an env variable.

## Streaming, route and security

- `POST /api/coach/chat` (route handler, streaming response). Same self-authentication as the
  upload route: the proxy matcher excludes `api/`, so it calls `getSession()` and
  `hasRoxcoachAccess` itself, 401 and 403 before anything else.
- Request: `{ conversationId: string | null, message: string }`. A `null` conversation starts a new
  one. The message is limited in length (a constant).
- The server loads the last 20 messages of the conversation, builds the context block, runs the model
  with the tools, streams text to the browser, and saves the user message and the final assistant
  text. A cancelled request saves the user message and no assistant message.
- The API key is read only on the server through `src/env/server.ts`. It never reaches the client,
  logs or error payloads.
- Prompt injection: activity names, notes and station data are athlete-controlled text and arrive
  inside the context and tool results. The system prompt states that this text is data, never
  instructions. The structural defence is that the tools are read-only and scoped to the user, so
  injected text cannot change or read anything else.
- Privacy: the Gemini free tier may use requests to improve Google products. The athlete accepted
  that for training data. The model never receives a name, email or id. Free-text notes are sent
  because they are the injuries and limits the coach needs.

## Limits and failures

| Case                                 | Behaviour                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daily cap                            | at most 50 user messages per athlete per day (a constant), counted from the saved messages; above it the route answers 429 with "You reached today's message limit" |
| Provider rate limit or outage        | the chat shows "The coach is busy, try again in a minute" and keeps the typed message                                                                               |
| Empty data (no races, no activities) | the context says so, and the coach answers accordingly (for example asks the athlete to add a race), without inventing                                              |
| Provider blocks a reply (safety)     | a short neutral message, the message is not saved as an assistant reply                                                                                             |
| Network cut mid-stream               | the partial text is kept in the UI and marked incomplete, not saved                                                                                                 |

## Persistence

New tables in migration `0009`, each with `user_id` default `auth.uid()` with cascade, RLS with the
owner policy and `roxcoach.has_access()`, grants as in `0001`.

`coach_conversations`: `id` uuid, `title` text (the first message, truncated), `created_at`,
`updated_at`. Index on `(user_id, updated_at desc)`. `unique (id, user_id)`.

`coach_messages`: `id` uuid, `conversation_id` uuid with composite foreign key
`(conversation_id, user_id)` to `coach_conversations` and `on delete cascade`, `role` text check in
`user`, `assistant`, `content` text not null, `model` text null (assistant only),
`prompt_tokens` int null, `completion_tokens` int null, `created_at`. Index on
`(conversation_id, created_at)`.

Tool calls and results are not stored in v1, only the final text. The same migration drops the
tables and types of the removed report and plan features: `weekly_reports`, `planned_sessions`,
`report_status`, `planned_session_status`. Nothing reads them. Conversations are deleted by the
athlete (a delete action per conversation, hard delete with cascade).

## UI

- Dashboard: a floating bar at the bottom ("Ask your coach...") that expands into a chat panel, in
  the style of the reference screenshots: header with a coach title, a menu (new conversation, past
  conversations, delete), a greeting, suggestion chips, the message list, an input and a send
  button. No microphone.
- Suggestion chips (copy fixed in the plan): "How is my training going?", "Am I on track for my
  next race?", "What should I do this week?".
- The panel opens on the latest conversation (or a new one when there is none). Messages stream in.
  The assistant text renders as simple markdown (paragraphs, lists, bold), nothing that can inject
  HTML. A stop button cancels the stream.
- Responsive: on narrow screens the panel is a full-height drawer; on wide screens a fixed panel at
  the bottom right. Built from the existing UI components (drawer, button, form, input) and the
  project design tokens, base-ui only.
- States: empty (greeting and chips), loading history, streaming, error with retry, limit reached,
  incomplete reply.

## What this replaces

- `coach.md` (weekly report, memory, cron, Trigger.dev job) and `plan.md` (stored plan, matching)
  are superseded: they are deleted in the same change that builds the chat, and the README index,
  `architecture.md` (module table, jobs, env variables), `ux-design.md` (the Coach and Plan
  screens), `database.md` (tables and migration list) are updated.
- The `/coach` and `/plan` routes and their navigation entries are removed. The Races page stays.
- `NEXT_ANTHROPIC_AI_KEY` is replaced by `NEXT_GEMINI_API_KEY` (and the model id variable), both
  optional at startup with a tagged error when missing. `NEXT_CRON_SECRET` and the cron route are
  dropped. `trigger.config.ts` and the Trigger.dev dependency stay only if something else uses them.

## Prerequisite

The coach needs goals. Races, availability and the profile have tables but no way to enter them in
the app yet: that is plan 3 (athlete profile, availability, races), paused. It must be built before
the chat is useful. Plan 3 stays as written, minus anything that referred to the removed report.

## Tests

- `buildCoachContext`: golden-text tests for a full athlete, an athlete with no races, no
  activities, a size-cap case that drops Recent first and never drops Goals; week boundaries and
  the timezone.
- Each tool: user scoping (a fake client asserts the `user_id` filter), range limits, result caps,
  invalid input rejected.
- The chat service with a fake `CoachModel`: history window, tool loop limit, saving on success,
  cancel, provider errors, daily cap.
- Route: 401, 403, bad body, over-length message, streaming happy path, daily cap.
- DB suites: the new tables isolate by user and the dropped tables are gone.
- UI: panel states and the stream rendering located by `data-testid`.
- Manual checklist at the end: ask five real questions against real data (goal check, last long
  run, week comparison, a Hyrox session with stations, a question with no data) and read the answers.

## Decisions made while checking the spec

These were open after a read-through by someone who had not seen the conversation. Each is the
author's call unless marked as the athlete's.

- **Order of work.** Plan 3 (profile, availability, races) is built first. The coach then uses the
  `athlete` and `races` services that plan 3 creates (`getProfile`, `getAvailability`, `listRaces`
  style services, names fixed by that plan). The chat plan lists exact service names once plan 3 is
  merged. Cross-module imports go through `services/` only.
- **Week math moves with its helpers.** `computeTotals`, `computeLoadRatio`, `activityDurationS` and
  the date helpers they use move to `src/_bff/core/utils/` and the calendar imports them from
  there. Weeks are ISO weeks starting Monday, in the athlete's timezone, exactly as the calendar
  does today. The context builder wraps activities as the `CalendarItem` type the functions already
  take.
- **Dates.** All ranges and week boundaries filter on the activity's `local_date` column (a plain
  date already computed in the athlete's timezone at upload). No timestamp conversion in the tools.
- **Daily cap.** One calendar day in the athlete's timezone. The user message is saved when the
  request arrives, so a cancelled or failed request still counts. That is intended, it stops the
  cap being bypassed by cancelling.
- **Failed replies.** If the model fails, the saved user message stays. When the history is built,
  consecutive user messages are merged into one turn (joined by a blank line) so the provider never
  sees two user turns in a row. The UI keeps the typed text and offers retry; a retry sends the same
  text again (the merge makes this harmless).
- **Conversation API.** Besides the streaming route, tRPC controllers in the usual layering:
  `listConversations` (latest 30, newest first), `getConversationMessages` (up to the latest 200 of
  one conversation), `deleteConversation`. The chat route creates conversations. No limit on
  stored conversations in v1.
- **Perceived effort** means `activities.perceived_effort` (1 to 10). The `rpe` column belongs to
  strength sets and is not used by the context or the tools in v1.
- **Dropped tables.** Verified: nothing in `src` or the DB tests references `weekly_reports`,
  `planned_sessions` or their types. The migration drops `planned_sessions` first (it references
  `weekly_reports`), then `weekly_reports`, then the two enum types. No production data exists to
  keep.
- **Routes.** `/coach` and `/plan` exist today as placeholder pages and as navigation entries in
  `src/components/app-shell.tsx`; both go. The chat lives on the dashboard only, so on mobile it is
  the same dashboard route.
- **Stream wire format.** Builder's call. Requirement: the client can tell apart, from the status
  or an event, these outcomes: stream finished, incomplete (connection lost), daily cap (429),
  provider busy (503 or an error event), and unauthorized. If the AI SDK `useChat` is used, the
  client sends only the new message plus `conversationId` (the server loads the history itself).
- **Trigger.dev.** Only `trigger.config.ts` and the two scripts use it today, so once the report
  job is gone nothing does. Removal of the SDK, scripts and config is listed as the athlete's
  decision below.

## Left to the builder

The streaming and tool-loop library, the exact model id, the exact size caps and the system prompt
wording (within the rules above), the markdown renderer, how the floating panel is positioned, and
the exact tool result shapes.

## Open questions

1. **Gemini free tier in the athlete's region (go or no-go).** The pricing page restricts free use in
   the EEA, UK and Switzerland. The athlete created a key; the first task of the plan is a one-call
   smoke test with it (run by the athlete, the key never pasted in chat). If the call is refused, the
   provider or billing changes, the rest of the spec stands because of the provider interface.
2. Whether the chosen free model follows tool calls reliably enough. Settle with the manual
   checklist; if not, switch the model id or the provider behind the interface.
3. **Trigger.dev removal (the athlete's decision).** Remove `@trigger.dev/sdk`, the `trigger:*`
   scripts and `trigger.config.ts` in the chat change, or keep them for a future background job.
   Knip rejects an unused dependency at commit time, so keeping them needs either a use or an
   ignore entry.
