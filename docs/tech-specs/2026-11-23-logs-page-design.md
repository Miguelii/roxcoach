# Logs page and persistent logs

## Intent

Errors in Roxcoach today only reach the console (Vercel or Trigger.dev logs), so a failed sync or a
broken route is invisible unless someone opens those dashboards. The other app in the same Supabase
project (personal-wallet) already keeps its logs in `public.logs` and has a `/portfolio/logs` page to
read them. The goal is the same for Roxcoach: every server error and the important info events (a
provider sync that started, succeeded or failed) are written to the shared table, and a `/logs` page
in the app, in the Soft Studio design, lets the athlete search and read them.

## Goals

- Every error logged by the server is persisted, including errors raised inside Trigger.dev tasks.
- Info events are persisted: a sync was started, succeeded (with its counts) or failed, per provider.
- The shared `public.logs` table gets a `project` column. Roxcoach rows carry `'roxcoach'`.
  Existing rows and the wallet's logger keep working without a code change (`default 'wallet'`).
- A `/logs` page with range, search, level and source filters, a histogram, a table and a detail
  view, visible to every signed-in Roxcoach user (decided for now; see Non-goals).

## Non-goals and anti-goals

- No admin gating of `/logs` for now: any user with Roxcoach access sees all Roxcoach logs. Gating
  (an `app_metadata` admin flag) is a later change, and the page must be easy to put behind it.
  Done on 2026-11-24: `/logs` and `logs.getAll` are admin only (`app_metadata.roxcoach_admin`), see
  [logs.md](logs.md) and [auth-security.md](auth-security.md#admin-flag).
- No client-side (browser) error reporting, no alerts or notifications, no retention change (the
  wallet's daily `purge_old_logs` job already deletes rows older than 30 days, ours included).
- No change to the wallet repository in this change. Its `sql/logs.sql` needs the same column as a
  follow-up there; until then the migration here is the source of the column.
- Anti-goal: secrets in the table. Everything persisted goes through the logger's existing
  redaction (keys like `password`, `token`, `apiKey`, `authorization`, `cookie` become
  `[redacted]`), and the Zepp token, Lyfta key and session cookies never appear in `message` or
  `metadata`.
- Anti-goal: the logger breaking the request. Persisting never throws and never delays a response.
- Anti-goal: the page showing the wallet's rows. Reads always filter `project = 'roxcoach'`.

## Constraints

- `public.logs` is the one allowed table in `public` (rule added to `CLAUDE.md`). Only the
  service-role client touches it, through a client created with `db: { schema: 'public' }`, used by
  the logger and the logs repository only. RLS stays on with no policies.
- Table today (wallet): `id uuid`, `created_at timestamptz`, `level text` (`debug`, `info`, `warn`,
  `error`), `prefix text`, `message text null`, `metadata jsonb null`, `user_id uuid null` (FK
  `auth.users`, `on delete set null`), indexes on `created_at desc` and `(level, created_at desc)`.
- The Roxcoach logger levels are `log`, `info`, `warn`, `error`. `log` is stored as `debug`.
- Trigger.dev tasks run outside Next.js and the process can end right after the task returns, so
  task code must await the insert (Next's `after()` does not exist there).
- Like the wallet, rows are persisted only when `NODE_ENV === 'production'` (the table is shared,
  so local runs must not fill it). `NODE_ENV` is added to `src/env/server.ts`.
- Specs in `docs/tech-specs/` are binding; this change updates `database.md`, `architecture.md`,
  `ux-design.md`, and a short `logs.md` module spec.

## Approaches considered

| Approach                                                | Trade-off                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. The logger persists** (as in the wallet)           | One write path for errors and info. `runEffect` already logs through it. Needs an awaitable variant for tasks and two new capture points (tasks, Next) |
| B. A separate event log service for info events         | Cleaner split between errors and events, but two write paths into one table and two things to keep redacted                                            |
| C. Read the Vercel and Trigger.dev logs from their APIs | No table, but no search across both, retention differs and it needs their API keys in the app                                                          |

**Chosen: A.** It is how the wallet works, so the page logic ports directly, and the redaction lives
in one place.

## Design

### Database (migration `0022_shared_logs_project.sql`)

`begin;` then `create table if not exists public.logs (...)` with the wallet's definition (so a
fresh database and the PGlite tests have it), `alter table public.logs add column if not exists
project text not null default 'wallet'`, `create index if not exists logs_project_created_at_idx on
public.logs (project, created_at desc)`, `alter table public.logs enable row level security`, then
the `schema_migrations` row and `commit;`. A db test checks the column, its default, the index and
that no policy exists on the table.

### Logger (`src/_bff/lib/server-logger.ts`)

- `Logger(props)` keeps its signature and console output. When persisting is on, it also inserts
  one row (`project: 'roxcoach'`, `level`, `prefix`, `message`, `metadata`, `user_id`) with
  `after()` inside a Next request scope, and a direct fire-and-forget insert outside it.
- `metadata` stores the redacted `metadata` plus the redacted serialized `error` under `error`,
  like the wallet.
- New `persistLog(props): Promise<void>`: same insert, awaited, never rejects. Tasks use it.
- An insert failure is reported with `console.error('[Logger] persist failed', message)` only.

### What gets logged

- **Errors:** `runEffect` failures and defects (already logged), a new `src/instrumentation.ts`
  with `onRequestError` for route handlers and server components, and the Trigger.dev tasks:
  `runSyncTask` logs the real tagged error (redacted) of a permanent failure and of every failed
  attempt (`warn` for retried ones), and `onFailure` logs the final failure (`error`). Task logging
  uses `persistLog` and is awaited before the task throws or returns.
- **Info events** (prefix `lyftaSync` / `zeppSync`): `Sync started` when the start service enqueues
  (metadata: `runId`), `Sync succeeded` when the task finishes (metadata: the result counts and the
  duration in ms), and the failure as an error as above.
- Every row carries the athlete's `user_id` when known.

### Backend

New module `src/_bff/modules/logs` with `logs.router.ts` and a `getAll` query (protected
procedure): input `{ range: '30m' | '1h' | '24h' | '7d' | '30d', search?: string (trim, max 200) }`,
output `{ logs: LogEntry[], isTruncated: boolean }`. The repository selects the 1000 most recent
rows with `project = 'roxcoach'` and `created_at >= since`, newest first, with the wallet's
`ilike` search over `message` and `prefix` (wildcards escaped, value quoted). Controller, service
(`Effect.fn`, service-role `public` client) and repository follow the existing module layout and
error conventions (`LogsClientError`, `LogsQueryError`, codes in `error-codes.ts`). Not cached:
logs must be fresh.

### Page `/logs`

Server component in `src/app/(app)/logs/page.tsx`, range and search in the URL (nuqs, as the
calendar does), data from `caller.logs.getAll`. A `LogsExplorer` client module in `src/modules/logs`
ports the wallet's: toolbar (range and search), histogram (recharts, buckets stacked by level),
level and source (prefix) facet filters applied client-side, table, and a detail view. When 1000 rows
come back a banner says the range was truncated.

```
Logs                                   [ Last 30 days v ] [ search...    ]
+---------------------------------------------------------------+
| histogram: ||||| |  ||||||||||  |||                           |   card, level tones
+---------------------------------------------------------------+
 Level  (o) error 4  ( ) warn 2  ( ) info 31   Source: lyftaSync zeppSync ...
+---------------------------------------------------------------+
| 10:42:01  ERROR  zeppSync       Your Zepp session expired      |
| 10:41:58  INFO   zeppSync       Sync started                   |
| 10:30:12  INFO   lyftaSync      Sync succeeded                 |
+---------------------------------------------------------------+
tap a row -> detail: full message, level, source, user, time, metadata as formatted JSON
```

Design: single-layer `bg-card` cards with `shadow-soft`, pill filters, semantic tokens only:
`error` red, `warn` amber, `info` blue, `debug` slate, using the `-soft` tint with the `-deep` text.
Mobile first: filters collapse into the shared `PopoverDrawer`, the table becomes a list of rows,
and the detail opens in a drawer. The detail view must use a shared component from
`src/components/ui` (extend `DrawerFormLayout` or add a read-only sibling there if neither fits;
never compose `Drawer*` in the module).

Navigation: a `Logs` item in the desktop sidebar after Settings. On a phone the bottom bar keeps
its four items and there is no link to Logs (the owner dropped the Settings link). Logs are not part of the sync button or the dashboard.

### Tests

Logger: persists on `error` and `info` with the redacted shape and `project`, never when
`NODE_ENV` is not production, never throws when the insert fails, awaits in `persistLog`. Task
logging: a permanent failure and the success log exactly once each with the right level. Start
service: logs `Sync started`. Logs service: range maps to `since`, search escaping, `project`
filter, truncation flag (fake client). Explorer: filters, histogram buckets, empty and truncated
states, detail view, URL state (test ids only). Migration test as above.

## Decisions the reviewer asked about

- **Visibility (decided by the owner):** every signed-in Roxcoach user sees every Roxcoach row,
  including rows with a null `user_id` (route errors, unauthenticated requests). This is a
  deliberate exception to "every repository query filters by `user_id`", for the logs repository
  only, and it is documented in `database.md` next to the `public.logs` rule. The page is built so
  that an admin gate is a one-line change in the procedure.
- **Persistence gate (my call):** one rule everywhere, `NODE_ENV === 'production'`, including
  Trigger.dev tasks (deployed workers run in production mode; `trigger dev` does not persist, like
  local `next dev`). First deploy step: confirm a task row appears, otherwise switch to an explicit
  flag.
- **Rollout order (my call):** the migration can be applied before any wallet change, because
  `default 'wallet'` keeps the wallet's inserts valid. The wallet's own `sql/logs.sql` must later use
  `add column if not exists project` and the index name `logs_project_created_at_idx`, so both
  repos converge.
- **Test harness (my call):** the PGlite helpers already create `auth.users` (Roxcoach's FKs need
  it), so the migration runs there; the builder adds the `public` schema scaffolding only if the
  helper lacks it.
- **Duplicate errors (my call):** tRPC procedure errors are returned by the route handler, not
  thrown to Next, so `onRequestError` does not see them. The builder verifies that, and skips any
  error `runEffect` already logged if it does.
- **Info event fields (answered):** Lyfta `{ created, updated, hasMore }` and Zepp `{ imported,
  skipped, updated, remaining }` already exist in the stored sync result and contain only counts.

## Left to the builder

- Exact bucket sizes per range for the histogram (the wallet's helpers are the reference).
- How `after()` outside a request is detected (the wallet catches the throw).
- The exact `NODE_ENV` wiring in `src/env/server.ts` and the Trigger.dev environment.
- Which of `DrawerFormLayout`'s props to extend for a read-only detail view.
