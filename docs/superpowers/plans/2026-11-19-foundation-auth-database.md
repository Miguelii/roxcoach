# Foundation, Auth and Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Roxcoach a working backend skeleton (env, Supabase clients, Effect and tRPC layers), a protected app behind a single email and password login with an access flag, and the multi-tenant database schema with tested isolation.

**Architecture:** BrewStock's `_bff` layering (controller, service, repository) over Supabase, with every service in Effect v4. The Supabase project is shared with another app, so all objects live in a `roxcoach` schema and access is an `app_metadata.roxcoach` flag checked in the proxy, in `protectedProcedure` and in RLS. The schema is tested for tenant isolation with an in-process Postgres (PGlite), no Supabase needed.

**Tech Stack:** Next.js 16 App Router, TypeScript, Effect v4, tRPC 11, Supabase (`@supabase/ssr`), zod 4, react-hook-form, Vitest via `vp test`, PGlite for SQL tests.

**Spec:** `specs/architecture.md`, `specs/auth-security.md`, `specs/database.md` (and `specs/README.md` for decisions). The specs win over this plan.

This is plan 1 of 6. Later plans, each producing working software on its own: 2 athlete profile, availability and races with real data; 3 Strava (OAuth, webhook, sync); 4 training data, manual logging and the real calendar; 5 coach weekly report, memory, plan and cron; 6 remove the mock data layer.

## Global Constraints

- All code, identifiers, comments and error tags in English. UI copy in English. No em-dashes anywhere (code, comments, docs, commit messages).
- Package manager is `pnpm`. Use `@/` imports everywhere under `src/`, never relative imports.
- Types are declared at the top of the file. Component props use a named `type Props`. Class merging uses `cn()` from `@/lib/utils`. Colors use semantic tokens, never `text-white` or similar.
- shadcn components use `base-ui`, never Radix.
- Services are `Effect.fn('name')` functions on Effect v4. Errors are `Data.TaggedError` classes in `src/_bff/lib/errors.ts` with `cause: unknown` and `error_hash: ErrorCode`; codes live in `src/_bff/lib/error-codes.ts`. Never use try/catch inside `Effect.gen`. Use `return yield*` when failing.
- Controllers: one file per route in `controllers/<name>.controller.ts` exporting exactly one constant `<NAME>_PUBLIC_CONTROLLER` or `<NAME>_PROTECTED_CONTROLLER`, with an exhaustive `Match.tag` error map. Never map `UnauthenticatedError` or `GetUserError` in a protected controller.
- Every repository function takes `supabase` then `userId` and filters or inserts with `user_id` explicitly.
- Every Supabase client is created with `db: { schema: 'roxcoach' }`. Nothing is created in the `public` schema.
- Access flag is exactly `app_metadata.roxcoach === true` (strict boolean).
- Login failure must be the same generic message for wrong password and for an account without the flag: "Invalid email or password".
- Every element used in tests carries a `data-testid`; tests locate by test id only.
- Every commit must pass the pre-commit hook (`pnpm fmt`, `pnpm check`, `pnpm knip`). Knip treats test files as usage. Run `pnpm test` before each commit. End every commit message with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Nothing may be pushed, and no real Supabase project is touched in this plan. No secrets in the repo (`.env*` stays git-ignored, only `.env.example` is committed).

## Review Focus

1. A user of the other app (valid password, no `app_metadata.roxcoach`) tries to log in: must get the generic failure and must be signed out, not left with a session cookie.
2. `returnTo` open redirects: `//evil.com`, `/\evil.com`, `https://evil.com`, `javascript:` and percent-encoded variants must all fall back to `/dashboard`.
3. The proxy must create the Supabase client and call `getClaims()` with nothing in between, must copy refreshed cookies to the response it returns, and must treat a signed-in user without the flag as unauthenticated on protected paths.
4. Passwords, tokens and secrets must never reach logs or error payloads (logger redaction, `cause` handling in controllers).
5. Tenant isolation holds at the database: user A cannot read or write B's rows, cannot attach a child to B's parent even through a privileged client, a user without the flag sees nothing, and a client session cannot read `strava_connections`.

---

### Task 1: Dependencies, env, conventions

**Files:**

- Create: `src/env/server.ts`, `src/env/client.ts`, `.env.example`, `src/_bff/core/utils/url.utils.ts`, `src/lib/__mocks__/server-only.ts`, `CLAUDE.md`
- Modify: `package.json`, `vite.config.ts`
- Test: `src/_bff/core/utils/__tests__/url.utils.test.ts`

**Interfaces:**

- Produces: `ServerEnv` (`src/env/server.ts`) with required `NEXT_SUPABASE_URL`, `NEXT_SUPABASE_PUBLISHABLE_KEY`, `NEXT_SUPABASE_SERVICE_ROLE_KEY` and optional `NEXT_ANTHROPIC_AI_KEY`, `NEXT_STRAVA_CLIENT_ID`, `NEXT_STRAVA_CLIENT_SECRET`, `NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN`, `NEXT_CRON_SECRET`; `ClientEnv` with `NEXT_PUBLIC_WEBSITE_URL`; `normalizeWebsiteUrl(url?: string): string`.

- [ ] **Step 1: Write the failing test** `url.utils.test.ts`: `normalizeWebsiteUrl()` returns `http://localhost:3000`; `normalizeWebsiteUrl('https://roxcoach.app/')` returns `https://roxcoach.app`; `normalizeWebsiteUrl('https://roxcoach.app')` is unchanged.
- [ ] **Step 2: Run** `pnpm test url.utils` and confirm it fails (module missing).
- [ ] **Step 3: Install** `@supabase/ssr @supabase/supabase-js @t3-oss/env-nextjs @trpc/server @trpc/client @trpc/react-query @tanstack/react-query server-only` with pnpm.
- [ ] **Step 4: Implement** `normalizeWebsiteUrl` (strip one trailing slash, default `http://localhost:3000`), the two env modules with `@t3-oss/env-nextjs` and zod (copy BrewStock's shape: `createEnv`, `runtimeEnv`; client value passes through `normalizeWebsiteUrl`), and `.env.example` listing every variable with empty values and a one-line comment each.
- [ ] **Step 5: Configure tests.** In `vite.config.ts` add alias `server-only` to `src/lib/__mocks__/server-only.ts` (`export {}`) and `test.env` with dummy values for the three required server variables so imports of `ServerEnv` work in tests.
- [ ] **Step 6: Write `CLAUDE.md`** (under 120 lines) porting the rules in Global Constraints plus: `PageProps<'/route'>` and `LayoutProps` helpers only, forms in `use-<name>.ts` hooks, `@/_bff/core` placement rule for code shared by frontend and `_bff`, and "read `specs/<module>.md` before touching a module and update it in the same change".
- [ ] **Step 7: Run** `pnpm test && pnpm check && pnpm knip`; expected all pass.
- [ ] **Step 8: Commit** `chore: env, dependencies and project conventions`.

### Task 2: Supabase clients, errors, logger

**Files:**

- Create: `src/_bff/core/constants/db.constants.ts`, `src/_bff/core/db/index.ts`, `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`, `src/_bff/lib/server-logger.ts`, `src/_bff/lib/tests-utils.ts`
- Test: `src/_bff/core/db/__tests__/db.test.ts`, `src/_bff/lib/__tests__/server-logger.test.ts`

**Interfaces:**

- Produces: `DB_SCHEMA = 'roxcoach'`; `createDBAdminClient(): SupabaseClient` (service-role, no cookies); `createDBServerClient(useSecretKey?: boolean, hooks?: { onGetAll?: GetAllCookies; onSetAll?: SetAllCookies }): Promise<SupabaseClient>` (cookie session, publishable key unless `useSecretKey`); error classes `CreateSbClientError`, `GetUserError`, `SignInWithPasswordError`, `AccessDeniedError`, `LogoutError`, each `ServiceErrorFields = { cause: unknown; error_hash: ErrorCode }`; `enum ErrorCode` with members `AUTH_SESSION_SB_CLIENT`, `AUTH_SESSION_GET_USER`, `AUTH_LOGIN_SB_CLIENT`, `AUTH_LOGIN_SIGN_IN`, `AUTH_LOGIN_SIGN_IN_ERR`, `AUTH_LOGIN_NO_ACCESS`, `AUTH_LOGOUT_SB_CLIENT`, `AUTH_LOGOUT_SIGN_OUT` (distinct 8-character lowercase alphanumeric values); `Logger(props: { level: 'log' | 'warn' | 'error' | 'info'; prefix: string; error?: unknown; message?: string; metadata?: Record<string, unknown>; userId?: string }): void` (console only); `failureTag(exit): string | null` and `asClient(from)` test helpers (same as BrewStock's `tests-utils.ts`).

- [ ] **Step 1: Write failing tests.** `db.test.ts` (mock `@supabase/ssr`, `@supabase/supabase-js` and `next/headers`): `createDBServerClient()` calls `createServerClient` with the publishable key and `db.schema === 'roxcoach'`; `createDBServerClient(true)` uses the service-role key; `createDBAdminClient()` calls `createClient` with the service-role key and `db.schema === 'roxcoach'`. `server-logger.test.ts`: logging an error whose `cause` contains keys `password`, `access_token`, `refresh_token`, `token`, `secret` prints those values as `[redacted]` (checked at any nesting depth) and never prints the original values.
- [ ] **Step 2: Run** both tests and confirm they fail.
- [ ] **Step 3: Implement** the files above. Port `createDBServerClient` and `createDBAdminClient` from BrewStock (`/Users/miguel/Desktop/work/brewstockai/src/_bff/core/db/index.ts`), adding the schema option. The logger serializes errors to JSON-safe values and redacts by key name, case-insensitive. Error and code files follow `specs/architecture.md` layer rules.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: supabase clients with roxcoach schema, errors and redacting logger`.

### Task 3: Auth services and access check

**Files:**

- Create: `src/_bff/core/helpers/access.helper.ts`, `src/_bff/modules/auth/services/get-session.service.ts`, `get-cached-claims.service.ts`, `sb-login.service.ts`, `sb-logout.service.ts`
- Test: `src/_bff/core/helpers/__tests__/access.helper.test.ts`, `src/_bff/modules/auth/services/__tests__/sb-login.service.test.ts`, `sb-logout.service.test.ts`, `get-session.service.test.ts`

**Interfaces:**

- Consumes: Task 2 clients, errors, codes, `failureTag`.
- Produces: `hasRoxcoachAccess(subject: { app_metadata?: unknown } | null | undefined): boolean`; `getSession(): Effect<User | null, CreateSbClientError | GetUserError>` (request-cached with React `cache`, returns `null` when signed out); `getCachedClaims(): Promise<SessionClaims | null>` with `SessionClaims = { userId: string; email: string | null; fullName: string | null; hasAccess: boolean }`; `sbLogin(email: string, password: string): Effect<{ status: 200 }, CreateSbClientError | SignInWithPasswordError | AccessDeniedError>`; `sbLogout(): Effect<{ status: 200 }, CreateSbClientError | LogoutError>`.

- [ ] **Step 1: Write failing tests.** `hasRoxcoachAccess`: true for `{ app_metadata: { roxcoach: true } }`; false for `null`, `undefined`, `{}`, `{ app_metadata: {} }`, `{ app_metadata: { roxcoach: 'true' } }`, `{ app_metadata: { roxcoach: 1 } }`, `{ app_metadata: { roxcoach: false } }`. `sbLogin` (fake client as in BrewStock's `sb-login.service.test.ts`): success returns `{ status: 200 }` and calls `signInWithPassword({ email, password })`; auth error fails with `SignInWithPasswordError`; a successful sign-in whose user lacks the flag calls `auth.signOut()` and fails with `AccessDeniedError`; client creation failure fails with `CreateSbClientError`. `sbLogout`: calls `signOut`, maps a returned error to `LogoutError`. `getSession`: returns the user, returns `null` on an auth error from `getUser`, fails with `GetUserError` when the call throws.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement** the services following BrewStock's equivalents in `src/_bff/modules/auth/services/`. `getCachedClaims` validates the claims with zod (missing or malformed fields read as `null`) and derives `hasAccess` from `app_metadata` through `hasRoxcoachAccess`.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: auth services with roxcoach access flag`.

### Task 4: tRPC layer and auth router

**Files:**

- Create: `src/_bff/trpc/{context,server,utils,router,caller}.ts`, `src/_bff/modules/auth/controllers/sb-login.controller.ts`, `sb-logout.controller.ts`, `src/_bff/modules/auth/auth.router.ts`, `src/app/api/trpc/[trpc]/route.ts`, `src/lib/trpc.ts`, `src/providers/trpc-provider.tsx`
- Modify: `src/app/layout.tsx` (wrap children in `TrpcContextProvider`)
- Test: `src/_bff/trpc/__tests__/utils.test.ts`, `src/_bff/trpc/__tests__/server.test.ts`, `src/_bff/modules/auth/controllers/__tests__/sb-login.controller.test.ts`

**Interfaces:**

- Consumes: Task 3 services and `getCachedClaims`.
- Produces: `router`, `publicProcedure`, `protectedProcedure` (ctx gains `user: User`; no session fails `UNAUTHORIZED`, a session without `hasRoxcoachAccess` fails `FORBIDDEN`, an infrastructure failure fails `INTERNAL_SERVER_ERROR`); `runEffect<A, E extends { _tag: string; error_hash: string }>(effect, context: string, mapCode: (error: E) => TRPCError['code']): Promise<A>` (logs through `Logger`, failure message is the `error_hash`, a defect becomes `INTERNAL_SERVER_ERROR` with message `unexpected_defect`); `SB_LOGIN_PUBLIC_CONTROLLER` (input `{ email: z.email(), password: z.string().min(1) }`, mutation), `SB_LOGOUT_PUBLIC_CONTROLLER`; `AUTH_ROUTER = router({ login, logout })`; `appRouter` with `auth: AUTH_ROUTER`; `type AppRouter`; `createCaller(): Promise<...>`; `trpcClient` (`createTRPCReact<AppRouter>()`); `TrpcContextProvider`.

- [ ] **Step 1: Write failing tests.** `utils.test.ts`: a failing effect with tag `X` maps through `mapCode` and the thrown `TRPCError` has that code and `message === error_hash`; a defect throws `INTERNAL_SERVER_ERROR` with message `unexpected_defect`; success returns the value; the logger is never called with the raw `cause` of a `SignInWithPasswordError` containing a password. `server.test.ts` (tiny router built with `protectedProcedure`, `getSession` mocked): no user gives `UNAUTHORIZED`, user without flag gives `FORBIDDEN`, user with flag reaches the resolver with `ctx.user`, a `getSession` failure gives `INTERNAL_SERVER_ERROR`. `sb-login.controller.test.ts`: `SignInWithPasswordError` and `AccessDeniedError` both map to `UNAUTHORIZED` with the same message shape, `CreateSbClientError` maps to `INTERNAL_SERVER_ERROR`, invalid email input is rejected by zod.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement** the layer following BrewStock (`src/_bff/trpc/*`, `src/app/api/trpc/*/route.ts`, `src/lib/trpc.ts`, `src/providers/trpc-provider.tsx`) without the admin, core, credits and report modules and without log persistence. `runEffect` must not forward `cause` to the client.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: trpc layer, auth router and provider`.

### Task 5: Proxy with access gate

**Files:**

- Create: `src/_bff/core/constants/auth.constants.ts`, `src/_bff/core/helpers/auth-redirect.helper.ts`, `src/_bff/core/helpers/safe-redirect.helper.ts`, `src/lib/utils.server.ts`
- Modify: `src/proxy.ts`, `specs/auth-security.md` (add `/coach` to the protected paths line)
- Test: `src/_bff/core/helpers/__tests__/auth-redirect.helper.test.ts`, `safe-redirect.helper.test.ts`, `src/lib/__tests__/utils.server.test.ts`

**Interfaces:**

- Consumes: Task 2 `createDBServerClient`, Task 3 `hasRoxcoachAccess`.
- Produces: `AUTH_PAGE_PATH = '/login'`, `DEFAULT_POST_AUTH_PATH = '/dashboard'`, `PROTECTED_PATHS: string[]` = `['/dashboard', '/coach', '/activities', '/plan', '/races', '/settings']`; `decideAuthRedirect(input: { pathname: string; hasAccess: boolean }): string | null` (`'/login'` for a protected path without access, `'/dashboard'` for `/login` with access, otherwise `null`; a path only matches a protected prefix on a segment boundary, so `/plans-extra` does not match `/plan`); `safeReturnTo(returnTo: string | null | undefined, fallback?: string): string` (accepts only same-site absolute paths, default fallback `DEFAULT_POST_AUTH_PATH`); `sbProxy(request: NextRequest): Promise<NextResponse>`.

- [ ] **Step 1: Write failing tests.** `decideAuthRedirect` table: each protected path and a nested path without access gives `/login`; with access gives `null`; `/login` with access gives `/dashboard`; `/login` without access gives `null`; `/` gives `null`; `/plans-extra` gives `null`. `safeReturnTo`: `/plan` and `/races?x=1` pass; `//evil.com`, `/\evil.com`, `https://evil.com`, `javascript:alert(1)`, `%2F%2Fevil.com`, empty, `null` and `undefined` give the fallback. `sbProxy` (mock `createDBServerClient`): no claims on `/dashboard` redirects to `/login`; claims without `app_metadata.roxcoach` on `/dashboard` redirects to `/login`; claims with the flag on `/login` redirect to `/dashboard`; with the flag on `/dashboard` returns the pass-through response; `getClaims` is the first call made on the client; cookies set through `onSetAll` end up on the returned response.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement** by porting BrewStock's `sbProxy` (`/Users/miguel/Desktop/work/brewstockai/src/lib/utils.server.ts`), delegating the decision to `decideAuthRedirect`, keeping the "nothing between client creation and `getClaims()`" comment. `safeReturnTo` must decode before checking. Update `src/proxy.ts` to call `sbProxy` then `setCSP`; its matcher stays as is.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: auth proxy with access gate and safe redirects`.

### Task 6: Login page and logout

**Files:**

- Create: `src/app/(auth)/login/page.tsx`, `src/modules/auth/login-card.tsx`, `src/modules/auth/use-login-form.ts`
- Modify: `src/components/app-shell.tsx` (logout calls `auth.logout`), `src/app/page.tsx` stays redirecting to `/dashboard`
- Test: `src/modules/auth/__tests__/use-login-form.test.ts`, `src/modules/auth/__tests__/login-card.test.tsx`

**Interfaces:**

- Consumes: `trpcClient.auth.login` and `.logout`, `safeReturnTo`, `DEFAULT_POST_AUTH_PATH`.
- Produces: `useLoginForm()` and `type LoginValues` (schema in the hook file: `email: z.email()`, `password: z.string().min(1)`); `LoginCard` with props `{ returnTo?: string }`; test ids `login-card`, `login-email`, `login-password`, `login-submit`, `login-error`, `logout-button`.

- [ ] **Step 1: Write failing tests.** Schema: invalid email and empty password are rejected with messages; valid values pass. `login-card.test.tsx` (mock `@/lib/trpc` and `next/navigation`): submitting empty fields shows field errors and does not call the mutation; a rejected login shows exactly "Invalid email or password" in `login-error` (same text for any error); a resolved login calls `router.replace` with `safeReturnTo(returnTo)` (checked for `returnTo="/plan"` and for `returnTo="//evil.com"` giving `/dashboard`) and then `router.refresh()`; the submit button is disabled while pending.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement.** Page follows `PageProps<'/login'>`, reads `returnTo` from `searchParams` inside a `Suspense` boundary (the project uses `cacheComponents`), sets `robots: { index: false }` metadata and no breadcrumb schema. Card: centered on the paper ground, `.display` heading "Roxcoach", BrewStock form pattern (`Form`, `FormField`, `FormControl`, `FormMessage`), no sign-up or reset links. Logout in the account menu calls `trpcClient.auth.logout.useMutation().mutateAsync()` assigned to an explicitly typed `Promise<{ status: 200 }>` variable, then `router.replace('/login')`.
- [ ] **Step 4: Verify in the browser** with `preview_start` `roxcoach`: with no Supabase configured the form must still render, show validation errors and the generic failure message on submit. Record in the task report that real login was not exercised (no project configured).
- [ ] **Step 5: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 6: Commit** `feat: login page and logout`.

### Task 7: Database schema migrations and test harness

**Files:**

- Create: `db/migrations/0001_schema_and_enums.sql`, `0002_athlete_and_races.sql`, `0003_strava.sql`, `0004_training.sql`, `0005_coach_and_plan.sql`, `db/tests/helpers/pglite.ts`, `db/README.md`
- Modify: `package.json` (devDependency `@electric-sql/pglite`), `vite.config.ts` (`test.include` also matches `db/tests/**/*.test.ts`)
- Test: `db/tests/schema.test.ts`

**Interfaces:**

- Produces: the schema defined in `specs/database.md` (every table, enum, unique constraint, index and composite foreign key listed there, all inside schema `roxcoach`, schema-qualified); `createTestDb(): Promise<{ db: PGlite; asUser(userId: string, options?: { access?: boolean }): Promise<void>; asService(): Promise<void>; close(): Promise<void> }>` which boots PGlite, creates stubs for what Supabase provides (`auth.users(id uuid primary key, raw_app_meta_data jsonb)`, `auth.uid()` and `auth.jwt()` reading `request.jwt.claims`, roles `anon`, `authenticated`, `service_role`), applies every file in `db/migrations/` in order, and switches role and claims for `asUser` and `asService`.

- [ ] **Step 1: Write failing tests** `schema.test.ts` using `createTestDb`: all tables listed in `specs/database.md` exist in schema `roxcoach` and none exist in `public`; inserting an `activity_laps` row whose `user_id` differs from its activity's `user_id` fails (composite foreign key), done as the service role; the same for `station_results`, `strength_sets` and `planned_sessions` (report, race and matched activity); deleting a race sets `planned_sessions.race_id` to null without touching `user_id`; unique constraints reject a duplicate `(user_id, weekday, session_kind)`, `(user_id, week_start)`, `(user_id, strava_id)` and a duplicate webhook event key; the same values for a different user are accepted; deleting a row from `auth.users` cascades to every table.
- [ ] **Step 2: Run** `pnpm test db/tests` and confirm failure.
- [ ] **Step 3: Implement** the migrations exactly as `specs/database.md` describes (columns, types, enums, defaults including `user_id default auth.uid()`, checks, indexes, `unique (id, user_id)` on parents, `on delete set null (<column>)` links, `set_updated_at()` trigger). `0001` also creates the schema and the grants described in "Shared project rules". RLS is deliberately not in these files (Task 8). `db/README.md` explains how to apply the files to the shared project with the SQL editor, in order, and how to confirm nothing landed in `public`.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`. If PGlite cannot run a required feature, stop and report which one and the smallest alternative; do not silently drop tests.
- [ ] **Step 5: Commit** `feat: roxcoach schema migrations with composite tenant keys`.

### Task 8: RLS, access function, seed and isolation tests

**Files:**

- Create: `db/migrations/0006_rls.sql`, `db/seed/grant-access.sql`
- Modify: `db/README.md` (RLS and seed steps)
- Test: `db/tests/tenant-isolation.test.ts`

**Interfaces:**

- Consumes: Task 7 `createTestDb`.
- Produces: `roxcoach.has_access()` (stable SQL function returning `coalesce((auth.jwt() -> 'app_metadata' ->> 'roxcoach')::boolean, false)`); RLS enabled on every table; one policy per operation on every table except `strava_connections` and `strava_webhook_events` (RLS on, no policies); `db/seed/grant-access.sql` containing the `update auth.users ... '{"roxcoach": true}'` statement from `specs/auth-security.md` with the email as a clearly marked placeholder and the `athlete_profiles` insert.

- [ ] **Step 1: Write failing tests** with users A (flag) and B (flag) and C (no flag), each with rows in every user-owned table inserted by the service role: A selects only A's rows from every table; A cannot update or delete B's rows (zero rows affected); A cannot insert a row with `user_id = B` (policy violation); A cannot insert a lap for B's activity; C selects zero rows and cannot insert in any table; `anon` selects nothing; `authenticated` selecting `strava_connections` or `strava_webhook_events` returns zero rows or a permission error (assert whichever the migration produces, but never data); `asService` reads all rows; deleting user A removes A's rows and leaves B's.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement** `0006_rls.sql` per `specs/database.md` "Row Level Security" and the seed file. Also add the migration listed as `0007_tenant_tests.sql` in the spec? No: the PGlite tests replace it, so edit `specs/database.md` migrations table to drop `0007` and mention the tests in `db/tests`.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: rls policies, access function and tenant isolation tests`.
