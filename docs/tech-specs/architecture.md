# Architecture (`_bff`)

Roxcoach reuses BrewStock's backend structure unchanged: a Next.js app whose backend lives in
`src/_bff/`, exposed through tRPC, with every service written in Effect v4 and data access in
repositories on top of Supabase.

## Stack

| Concern           | Choice                                                                           |
| ----------------- | -------------------------------------------------------------------------------- |
| Framework         | Next.js (App Router), React 19 with the React Compiler                           |
| Language          | TypeScript, all code and identifiers in English                                  |
| Backend style     | tRPC controllers, Effect v4 services, Supabase repositories                      |
| Database and auth | Supabase, an existing project shared with another app, own schema `roxcoach`     |
| Background work   | Trigger.dev v4 tasks in `src/_bff/modules/<module>/tasks/` (Lyfta and Zepp sync) |
| AI                | AI SDK with `@ai-sdk/google` (Gemini), added with the coach chat                 |
| UI                | Tailwind v4, shadcn on `base-ui` (never Radix), nuqs for URL-backed UI state     |
| Env               | `@t3-oss/env-nextjs` in `src/env/server.ts` and `src/env/client.ts`              |
| Tooling           | pnpm, vite-plus (`vp lint`, `vp fmt`, `vp test`), knip, husky, anti-slop         |

## Directory layout

```
src/
  _bff/
    core/        constants, helpers, utils importable by frontend and _bff; db/ (server only)
    lib/         errors.ts, error-codes.ts, server-logger.ts, tests-utils.ts
    trpc/        server.ts, utils.ts, context.ts, router.ts, caller.ts
    trigger/     run-sync-task.ts, the generic Trigger.dev task run shared by module tasks
    modules/<module>/
      <module>.router.ts
      controllers/<name>.controller.ts
      services/<name>.service.ts
      repositories/<table>.repository.ts
      processors/<name>.processor.ts
      tasks/<name>.task.ts (Trigger.dev tasks, scanned by trigger.config.ts)
      helpers/<name>.helper.ts
      constants/index.ts
      types/index.ts
  app/           routes
  components/ui/ shadcn components
  modules/       frontend feature modules
  lib/           frontend-only utilities and constants
  env/
  styles/
```

`_bff` never imports from `src/lib`, `src/modules`, `src/components`, `src/hooks` or `src/app`.
Anything shared with the frontend lives in `src/_bff/core/`, and files there must stay importable
from client components (no `server-only`, except `core/db/index.ts` and constants whose consumers
are all server-side).

## Backend modules

| Module     | Responsibility                                                                                     | Spec                                   |
| ---------- | -------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `auth`     | Login, logout, session and claims                                                                  | [auth-security.md](auth-security.md)   |
| `athlete`  | Profile and weekly availability                                                                    | [athlete-races.md](athlete-races.md)   |
| `races`    | Races and goals                                                                                    | [athlete-races.md](athlete-races.md)   |
| `training` | Activities, laps, manual sessions, calendar feed, file upload (`upload-activity` service, parsers) | [manual-logging.md](manual-logging.md) |
| `lyfta`    | Lyfta API key connection and manual workout import into `training`                                 | [lyfta.md](lyfta.md)                   |
| `coach`    | Chat with the AI coach: context block, read-only tools, Gemini provider, conversations             | [coach-chat.md](coach-chat.md)         |

Dependency direction: controller to service to (repository | processor | helper). Cross-module runtime imports only through `services/`
or `processors/`, never another module's controller or repository. A type-only import between
modules is allowed for shared DTOs (`training` imports `RaceDTO` from `races/types` to build
`RaceSummaryDTO`).

As built: `athlete` has the profile and availability controllers, services, validation helpers and
two repositories, plus `getAthleteTimezone`, which `races` calls through its service. `races` has
list, create, update, complete, cancel and delete controllers, the matching services, a
`listRacesInRange` service used by the `training` calendar feed, one repository and a validation
helper. Rules and file lists are in [athlete-races.md](athlete-races.md). `coach` reads the other
modules only through their services (`getProfile`, `getAvailability`, `getAthleteTimezone`,
`listRaces`, `getCalendar`, `getActivity`); the dashboard progress queries `training.getRunProgress`
and `training.getStrengthProgress` (pure aggregation helpers under `training/helpers`, zones in
`core/constants/hr-zones.constants.ts`, see [dashboard-progress.md](dashboard-progress.md)); the week totals and load ratio it shares with the
dashboard summary and calendar page live in `src/_bff/core/utils/week-stats.utils.ts` and
`week-dates.utils.ts`.

## Layer rules

- **Controller**: thin tRPC binding. Zod input, `runEffect(...)`, an exhaustive `Match` that maps
  each error tag to a TRPC code. One file per route exporting exactly one constant named
  `<NAME>_PROTECTED_CONTROLLER` or `<NAME>_PUBLIC_CONTROLLER`.
- **Service**: exported `Effect.fn('name')` function holding business logic. Creates the Supabase
  client and passes it to repositories. Chooses the publishable key or the service-role key.
- **Repository**: exported `Effect.fn` functions, one file per table. First parameters are
  `supabase: SupabaseClient` and `userId: string`. **Every query filters by `user_id` and every
  insert sets it**, even when RLS would also enforce it, because a service-role client
  bypasses RLS (see [database.md](database.md)). Every query checks
  both the `Effect.tryPromise` catch and the returned `error`.
- **Errors**: `Data.TaggedError` classes in `src/_bff/lib/errors.ts`, each with
  `cause: unknown` and `error_hash: ErrorCode`. Codes live in `src/_bff/lib/error-codes.ts`.
- **Auth**: `protectedProcedure` guarantees `ctx.user`. Never map `UnauthenticatedError` or
  `GetUserError` in a controller `Match`.
- **Router files** are the only place that import `server-only` alongside the controllers they
  compose. `src/_bff/trpc/router.ts` composes the module routers by namespace.

## tRPC namespaces

`auth`, `athlete`, `races`, `training`, `lyfta` and `coach` (composed in
`src/_bff/trpc/router.ts`). The `lyfta` namespace handles connection status, credential
management and manual workout sync (see [lyfta.md](lyfta.md)). The `coach` namespace has
`listConversations`, `getConversationMessages` and `deleteConversation`; the chat itself is a route
handler (below).

### Client

The frontend uses `@trpc/tanstack-react-query` (not the deprecated `@trpc/react-query`).
`src/lib/trpc.ts` exports `TRPCProvider` and `useTRPC` from `createTRPCContext<AppRouter>()`;
`src/providers/trpc-provider.tsx` mounts `QueryClientProvider` and `TRPCProvider` with a
`createTRPCClient` over `httpBatchLink` at `/api/trpc` (no transformer). Components call TanStack
Query directly with the options the proxy builds:

```tsx
const trpc = useTRPC()
const queryClient = useQueryClient()
const races = useQuery(trpc.races.list.queryOptions(input, { staleTime }))
const create = useMutation(trpc.races.create.mutationOptions())
await queryClient.invalidateQueries(trpc.races.list.queryFilter())
```

Cache reads and writes (optimistic updates) go through `queryClient` with
`trpc.x.queryKey(input)`; `queryFilter()` without input matches every input of a procedure.

Server Components use the server-side caller (`createCaller()` from `trpc/caller.ts`,
server-only), which builds the context and calls `appRouter.createCaller`. To prefetch data that
client hooks then read, a Server Component uses `getServerTrpc()` from `src/lib/trpc-server.ts`
(server-only): a request-scoped `QueryClient` plus `createTRPCOptionsProxy({ router, ctx,
queryClient })`, which calls the router in process (no HTTP). It reads with
`queryClient.query(trpc.x.queryOptions(input))` (TanStack Query 5.108 deprecates `fetchQuery` and
`prefetchQuery`; a prefetch adds `.catch(() => null)`), so the cache keys
match the client hooks, and passes `dehydrate(queryClient)` to a `HydrationBoundary` (used by the
dashboard page).

Component tests replace `@/lib/trpc` with `src/lib/__mocks__/trpc.ts` (the real options proxy over
a client with no links) and route `useQuery` / `useMutation` / `useQueryClient` by procedure path
with `routeTrpc` from `src/lib/__mocks__/trpc-path.ts`.

## Non-tRPC entry points

| Route                                    | Purpose                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/app/api/activities/upload/route.ts` | multipart activity upload, authenticates itself, delegates to the training upload service |
| `src/app/api/coach/chat/route.ts`        | streaming coach chat (NDJSON), authenticates itself, delegates to the coach chat handler  |

These are plain route handlers because tRPC carries neither multipart bodies nor a streaming response. The proxy matcher excludes `api/`, so each route authenticates itself. There is no cron route. See [manual-upload.md](manual-upload.md) and [coach-chat.md](coach-chat.md).

## Background tasks

The Lyfta and Zepp syncs run as Trigger.dev v4 tasks (see
[2026-11-23-background-sync-design.md](2026-11-23-background-sync-design.md)). There is still no
cron or scheduled job: a task only runs when a sync mutation enqueues it.

- `src/_bff/modules/lyfta/tasks/sync-lyfta-workouts.task.ts` (`sync-lyfta-workouts`) and
  `src/_bff/modules/zepp/tasks/sync-zepp-activities.task.ts` (`sync-zepp-activities`) are thin bindings, like
  controllers: they wire the module's sync service, its `finish*SyncRun` service and its permanent
  error classifier into `runSyncTask`, with `maxDuration: SYNC_TASK_MAX_DURATION_S`. No business
  logic and no Supabase calls in a task file.
- `src/_bff/trigger/run-sync-task.ts` holds the generic run: it validates the payload
  (`syncTaskPayloadSchema`, an invalid one aborts with `AbortTaskRunError`), runs the sync, records
  `succeeded` with the result, records `failed` with the `error_hash` and aborts (no retry) on a
  permanent error, and throws a plain `Error` with only the tag and code on a transient error so
  Trigger.dev retries (3 attempts, `trigger.config.ts` defaults). Messages never carry the error
  `cause`. A defect is rethrown.
- Each task's `onFailure` hook writes `failed` with `LYFTA_SYNC_FAILED` / `ZEPP_SYNC_FAILED` when
  the attempts run out or the run dies. The finish write only matches a `running` lease, so it
  never overwrites a code already written.
- Runs are enqueued from Next.js with `triggerTask` (`src/_bff/lib/trigger-client.ts`), which
  configures the SDK with `ServerEnv.TRIGGER_SECRET_KEY` and passes the idempotency key
  `<provider>:<userId>:<startedAt>`.
- The task code runs outside Next.js. `trigger.config.ts` builds with
  `build.conditions: ['react-server']` so packages resolve the way Next.js server code does. The
  Trigger.dev CLI also replaces `server-only` with a no-op module, so the existing
  `import 'server-only'` lines are harmless. `next/headers` is bundled (through
  `src/_bff/core/db/index.ts`) but never called on the task path, which only uses
  `createDBAdminClient`.
- The Trigger.dev project needs every variable `ServerEnv` requires, set in the Trigger.dev
  dashboard for both the dev and prod environments: `NEXT_SUPABASE_URL`,
  `NEXT_SUPABASE_PUBLISHABLE_KEY`, `NEXT_SUPABASE_SERVICE_ROLE_KEY` and `NEXT_LYFTA_ENCRYPTION_KEY`
  (which also decrypts the Zepp tokens). `TRIGGER_SECRET_KEY` is only needed by Next.js.

Local development runs `pnpm trigger:dev` next to `pnpm dev`; without it a sync stays `running`
until its lease goes stale. Production deploys the tasks with `pnpm trigger:deploy` whenever the
sync code changes, alongside the Vercel deploy. Both scripts run the Trigger.dev CLI pinned to the
SDK version (`pnpm dlx trigger.dev@4.8.8`).

## Persistent logs

`Logger` (`src/_bff/lib/server-logger.ts`) always prints to the console and, when
`NODE_ENV === 'production'` (or `NEXT_LOGS_PERSIST=true`; `false` turns it off), also inserts a row into `public.logs` with `project: 'roxcoach'`
(`src/_bff/lib/log-writer.ts`). Request code uses `Logger` (fire and forget, `after()` inside a
request scope); Trigger.dev tasks use `persistLog`, which awaits the insert because the process can
end right after the task returns. Metadata and the error pass through the logger's serializer
(`log-serializer.ts`), so keys such as `password`, `token`, `apiKey` or `cookie` are stored as
`[redacted]`. Persisting never throws: a failed insert only prints its message. The `public` schema
client is `createDBPublicAdminClient()` in `core/db`, used by the logger and the logs repository only.
Database side: [database.md](database.md).

## Environment variables

| Name                             | Scope  | Used by                                                                                                |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `NEXT_SUPABASE_URL`              | server | all Supabase clients                                                                                   |
| `NEXT_SUPABASE_PUBLISHABLE_KEY`  | server | session-bound client                                                                                   |
| `NEXT_SUPABASE_SERVICE_ROLE_KEY` | server | admin work                                                                                             |
| `NEXT_GEMINI_API_KEY`            | server | coach (Gemini)                                                                                         |
| `NEXT_SIGNUP_ACCESS_CODE`        | server | `/signup` access code, optional (unset closes sign-up), any length                                     |
| `NEXT_LYFTA_ENCRYPTION_KEY`      | server | Lyfta API key encryption                                                                               |
| `NEXT_ZEPP_ENCRYPTION_KEY`       | server | Zepp app token encryption                                                                              |
| `NEXT_BUILD_ID`                  | server | install prompt build check, optional (falls back to `VERCEL_GIT_COMMIT_SHA`)                           |
| `TRIGGER_SECRET_KEY`             | server | enqueueing the sync tasks, optional (unset makes a sync start fail)                                    |
| `NODE_ENV`                       | server | set by Next.js and the Trigger.dev runtime; logs are persisted in `production` by default              |
| `NEXT_LOGS_PERSIST`              | server | optional `true` or `false`: persist logs outside production (`trigger dev`) or stop them in production |
| `NEXT_PUBLIC_WEBSITE_URL`        | client | absolute URLs, OAuth redirect                                                                          |

In `src/env/server.ts` only the three Supabase variables are required. The Gemini
variables are optional at startup (the chat route answers 503 when the key is missing), and an empty value reads as unset (`emptyStringAsUndefined`).
`NEXT_LYFTA_ENCRYPTION_KEY` and `NEXT_ZEPP_ENCRYPTION_KEY` are also optional at startup, but must
be a valid base64-encoded 32-byte key when set. Lyfta and Zepp connection and sync operations fail
explicitly when their key is absent.
`NEXT_BUILD_ID` identifies the deployed build and defaults to Vercel's `VERCEL_GIT_COMMIT_SHA`; when
both are unset the install prompt only uses its 72 hour expiry.
`TRIGGER_SECRET_KEY` is the secret key of the Trigger.dev environment (dev or prod) the sync
mutations enqueue runs in; without it the start services fail with the enqueue error.
`NEXT_PUBLIC_WEBSITE_URL` is validated as an absolute URL in `src/env/client.ts` and defaults to
`http://localhost:3000` when unset or empty. `.env.example` lists every variable of the table above
with an empty value (`NEXT_ZEPP_ENCRYPTION_KEY` is read from `NEXT_LYFTA_ENCRYPTION_KEY`).

## Code placement

Follow BrewStock's rule: ownership follows usage.

| Consumers           | Where it lives                                              |
| ------------------- | ----------------------------------------------------------- |
| Frontend and `_bff` | `src/_bff/core/{constants,helpers,utils}/<theme>.<kind>.ts` |
| 2+ frontend modules | `src/lib/constants.ts`, `src/lib/formatters.ts`             |
| A single module     | Colocated `utils.ts` or `constants.ts`                      |

Pace, duration, distance and load formatters are used by both the calendar and the coach prompt,
so they live in `src/_bff/core/utils/formatters.utils.ts`. Hyrox station definitions and division
loads live in `src/_bff/core/constants/hyrox.constants.ts`.

## Project conventions to port

The new project has no `CLAUDE.md` yet. Port BrewStock's conventions, dropping what does not apply
(analysis flow, pages SEO format, MCP). The rules that must come across: English-only code, `@/`
imports, named `type Props` with types at the top of the file, `cn()` for class merging, semantic
color tokens, no em-dashes, `PageProps<'...'>` and `LayoutProps<'...'>` helpers, forms in a
`use-<form>.ts` hook plus a shadcn `Form` component, Effect v4 translation notes, and the
`data-testid` rule for smoke tests.

## Testing

Unit tests with `vp test run` for pure logic: pace and load math, lap-to-station mapping, the
coach context builder and tools. Services are tested with a fake Supabase client. Smoke
tests (Playwright) are added once the login and dashboard exist; read the e2e conventions ported
from BrewStock first.
