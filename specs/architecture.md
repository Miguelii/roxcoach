# Architecture (`_bff`)

Roxcoach reuses BrewStock's backend structure unchanged: a Next.js app whose backend lives in
`src/_bff/`, exposed through tRPC, with every service written in Effect v4 and data access in
repositories on top of Supabase.

## Stack

| Concern           | Choice                                                                       |
| ----------------- | ---------------------------------------------------------------------------- |
| Framework         | Next.js (App Router), React 19 with the React Compiler                       |
| Language          | TypeScript, all code and identifiers in English                              |
| Backend style     | tRPC controllers, Effect v4 services, Supabase repositories                  |
| Database and auth | Supabase, an existing project shared with another app, own schema `roxcoach` |
| Background work   | Trigger.dev v4                                                               |
| AI                | AI SDK with `@ai-sdk/anthropic`                                              |
| UI                | Tailwind v4, shadcn on `base-ui` (never Radix)                               |
| Env               | `@t3-oss/env-nextjs` in `src/env/server.ts` and `src/env/client.ts`          |
| Tooling           | pnpm, vite-plus (`vp lint`, `vp fmt`, `vp test`), knip, husky, anti-slop     |

## Directory layout

```
src/
  _bff/
    core/        constants, helpers, utils importable by frontend and _bff; db/ (server only)
    lib/         errors.ts, error-codes.ts, server-logger.ts, tests-utils.ts
    trpc/        server.ts, utils.ts, context.ts, router.ts, caller.ts
    modules/<module>/
      <module>.router.ts
      controllers/<name>.controller.ts
      services/<name>.service.ts
      repositories/<table>.repository.ts
      processors/<name>.processor.ts
      jobs/<name>.job.ts
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

| Module     | Responsibility                                            | Spec                                                           |
| ---------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `auth`     | Login, logout, session and claims                         | [auth-security.md](auth-security.md)                           |
| `athlete`  | Profile and weekly availability                           | [athlete-races.md](athlete-races.md)                           |
| `races`    | Races and goals                                           | [athlete-races.md](athlete-races.md)                           |
| `strava`   | OAuth, token refresh, webhook, activity fetch and mapping | [strava.md](strava.md)                                         |
| `training` | Activities, laps, manual sessions, calendar feed          | [strava.md](strava.md), [manual-logging.md](manual-logging.md) |
| `plan`     | Planned sessions and activity matching                    | [plan.md](plan.md)                                             |
| `coach`    | Weekly report: context, memory, prompt, generation        | [coach.md](coach.md)                                           |

Dependency direction: controller to service to (repository | processor | helper). Jobs call the
services or processors of their own module. Cross-module imports only through `services/` or
`processors/`, never another module's controller or repository.

## Layer rules

- **Controller**: thin tRPC binding. Zod input, `runEffect(...)`, an exhaustive `Match` that maps
  each error tag to a TRPC code. One file per route exporting exactly one constant named
  `<NAME>_PROTECTED_CONTROLLER` or `<NAME>_PUBLIC_CONTROLLER`.
- **Service**: exported `Effect.fn('name')` function holding business logic. Creates the Supabase
  client and passes it to repositories. Chooses the publishable key or the service-role key.
- **Repository**: exported `Effect.fn` functions, one file per table. First parameters are
  `supabase: SupabaseClient` and `userId: string`. **Every query filters by `user_id` and every
  insert sets it**, even when RLS would also enforce it, because jobs and the webhook run with the
  service-role client, which bypasses RLS (see [database.md](database.md)). Every query checks
  both the `Effect.tryPromise` catch and the returned `error`.
- **Errors**: `Data.TaggedError` classes in `src/_bff/lib/errors.ts`, each with
  `cause: unknown` and `error_hash: ErrorCode`. Codes live in `src/_bff/lib/error-codes.ts`.
- **Auth**: `protectedProcedure` guarantees `ctx.user`. Never map `UnauthenticatedError` or
  `GetUserError` in a controller `Match`.
- **Router files** are the only place that import `server-only` alongside the controllers they
  compose. `src/_bff/trpc/router.ts` composes the module routers by namespace.

## tRPC namespaces

`auth`, `athlete`, `races`, `strava`, `training`, `plan`, `coach`. Example client call:
`trpcClient.races.create.useMutation()`. Server Components use the server-side caller
(`createCaller()` from `trpc/caller.ts`, server-only), which builds the context and calls
`appRouter.createCaller`.

## Non-tRPC entry points

| Route                                      | Purpose                                               |
| ------------------------------------------ | ----------------------------------------------------- |
| `src/app/api/strava/webhook/route.ts`      | Strava webhook: GET verification, POST event intake   |
| `src/app/api/strava/callback/route.ts`     | Strava OAuth redirect handler                         |
| `src/app/api/cron/weekly-reports/route.ts` | called by `pg_cron`, fans out one report job per user |

These are plain route handlers because Strava calls them, not the browser app. They delegate to
`strava` services immediately and keep no logic of their own.

## Trigger.dev jobs

| Job                      | Module   | Trigger                                                                                |
| ------------------------ | -------- | -------------------------------------------------------------------------------------- |
| `sync-strava-activity`   | `strava` | webhook event or manual sync                                                           |
| `backfill-strava`        | `strava` | first connection                                                                       |
| `generate-weekly-report` | `coach`  | `pg_cron` Sunday 20:00 Europe/Lisbon via `/api/cron/weekly-reports`, or "Generate now" |

Every `jobs/` directory is listed in `trigger.config.ts` `dirs`. Jobs are idempotent: running a
job twice for the same activity or report week must not duplicate rows.

## Environment variables

| Name                               | Scope  | Used by                                                    |
| ---------------------------------- | ------ | ---------------------------------------------------------- |
| `NEXT_SUPABASE_URL`                | server | all Supabase clients                                       |
| `NEXT_SUPABASE_PUBLISHABLE_KEY`    | server | session-bound client                                       |
| `NEXT_SUPABASE_SERVICE_ROLE_KEY`   | server | jobs and Strava token access                               |
| `NEXT_ANTHROPIC_AI_KEY`            | server | coach                                                      |
| `NEXT_STRAVA_CLIENT_ID`            | server | OAuth                                                      |
| `NEXT_STRAVA_CLIENT_SECRET`        | server | OAuth and token refresh                                    |
| `NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN` | server | webhook GET verification                                   |
| `NEXT_CRON_SECRET`                 | server | bearer token `pg_cron` sends to `/api/cron/weekly-reports` |
| `TRIGGER_SECRET_KEY`               | server | Trigger.dev, triggers jobs from the app                    |
| `TRIGGER_PROJECT_REF`              | server | `trigger.config.ts` project ref (CLI dev and deploy)       |
| `NEXT_PUBLIC_WEBSITE_URL`          | client | absolute URLs, OAuth redirect                              |

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

Unit tests with `vp test run` for pure logic: pace and load math, lap-to-station mapping, plan
periodization helpers, context builders. Services are tested with a fake Supabase client. Smoke
tests (Playwright) are added once the login and dashboard exist; read the e2e conventions ported
from BrewStock first.
