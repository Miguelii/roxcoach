# Sign-up with an Access Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `/signup` page (email, password, access code). A correct code creates a confirmed Supabase user and grants Roxcoach access automatically by calling a SQL function that holds the `grant-access.sql` logic, then signs the user in and redirects to the dashboard.

**Architecture:** A migration adds `roxcoach.grant_access(user_id, display_name)` (`security definer`, executable only by `service_role`). A public tRPC mutation `auth.signUp` runs an Effect service: constant-time code check, `auth.admin.createUser`, rpc `grant_access` (delete the user again if it fails), `signInWithPassword` on the cookie client. The page and card mirror the login ones. The proxy treats `/signup` like `/login`. `NEXT_SIGNUP_ACCESS_CODE` unset means sign-up is closed.

**Tech Stack:** Effect v4 services, Supabase (admin client, rpc), tRPC v11 with `@trpc/tanstack-react-query`, zod 4, react-hook-form, PGlite for the DB tests, `pnpm test`.

**Spec:** `docs/tech-specs/signup-access-code.md` (binding). Also read `docs/tech-specs/auth-security.md`, `docs/tech-specs/database.md`, `db/README.md`, `CLAUDE.md`.

## Global Constraints

- All code, identifiers, comments, error tags, enum values and UI copy in English. No em-dashes anywhere (code, comments, docs, commits). `pnpm` only; run tests with `pnpm test` (never vitest directly); do not start a dev server; never read `.env*` files; nothing is pushed.
- Imports under `src/` use the `@/` alias. Types at the top of the file. Components take a named `type Props`. `cn()` for classes, semantic tokens only. shadcn components use base-ui, never Radix. Forms: hook in `use-<name>.ts` (zod schema and `FormValues` inside), `zodResolver`, shadcn `Form` with `FormField` + `FormControl` + `FormMessage`.
- `_bff` never imports from `src/lib`, `src/modules`, `src/components`, `src/hooks`, `src/app`. Code shared by the frontend and `_bff` lives in `src/_bff/core/`. Env is read only through `ServerEnv`.
- Tests locate elements by `data-testid` only. No module mocks when a fake dependency can be passed in (services take their clients and the expected code as parameters, so tests pass fakes).
- Secrets (the access code, the password, the service-role key) never reach logs, error payloads or URLs. Every failure of the sign-up returns the same client message and the same tRPC code.
- The access flag is written only by `roxcoach.grant_access`. Never pass `app_metadata` to `createUser`, never read or write `user_metadata`.
- Pre-commit runs `pnpm fmt`, `pnpm check`, `pnpm knip`; run `pnpm test` before committing. Every commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Update the specs in the same change when behavior, data or contracts change. Do not commit without asking the user.

## Review Focus

Failure modes the spec implies but no single task would pin; each is tested in the task named in brackets.

1. A bad code, a closed sign-up, a taken email and a failed grant return byte-identical client results; a bad code makes NO Supabase call [Tasks 2, 3].
2. A grant failure after the user was created deletes that user; a failed delete is logged but the response is still the generic failure, and no secret is in the log [Task 2].
3. The function is not callable by `anon` or `authenticated` (a user cannot grant themselves access through PostgREST) [Task 1].
4. The flag is merged into existing `app_metadata`, never replacing other keys; running it twice is harmless; an unknown user raises and writes nothing [Task 1].
5. `/signup` is public for anonymous visitors, redirects a signed-in user with access to `/dashboard`, and encoded variants (`/%73ignup`) behave the same [Task 4].
6. With the env unset the page is a 404 and the login page shows no link to it [Task 5].

---

## File Structure

| File                                                                                    | Responsibility                                                       |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `db/migrations/0017_grant_access_fn.sql`                                                | `roxcoach.grant_access` and its grants                               |
| `db/seed/grant-access.sql`, `db/tests/grant-access-fn.test.ts`, `db/tests/seed.test.ts` | the script calls the function; DB tests                              |
| `src/_bff/core/helpers/access-code.helper.ts`                                           | `isValidAccessCode(input, expected)` (client-safe, no `server-only`) |
| `src/_bff/core/constants/auth.constants.ts`, `helpers/auth-redirect.helper.ts`          | `SIGNUP_PAGE_PATH`, `PUBLIC_AUTH_PATHS`, redirect rule               |
| `src/_bff/modules/auth/repositories/access-grant.repository.ts`                         | rpc wrapper                                                          |
| `src/_bff/modules/auth/services/sb-sign-up.service.ts`                                  | the flow                                                             |
| `src/_bff/modules/auth/controllers/sb-sign-up.controller.ts`, `auth.router.ts`          | public procedure `auth.signUp`                                       |
| `src/_bff/lib/errors.ts`, `error-codes.ts`, `src/env/server.ts`                         | new tagged errors and codes, `NEXT_SIGNUP_ACCESS_CODE`               |
| `src/app/(auth)/signup/page.tsx`, `src/app/(auth)/login/page.tsx`                       | the page (404 when closed), link on login                            |
| `src/modules/auth/signup-card.tsx`, `use-signup-form.ts`, `login-card.tsx`              | UI                                                                   |
| docs                                                                                    | see the spec, "Docs to update"                                       |

---

### Task 1: Migration, DB tests and the seed wrapper

**Files:**

- Create: `db/migrations/0017_grant_access_fn.sql`, `db/tests/grant-access-fn.test.ts`
- Modify: `db/seed/grant-access.sql`, `db/tests/seed.test.ts` (only if an assertion needs the new shape), `db/tests/migrations.test.ts` (if it lists files), `docs/tech-specs/database.md`, `db/README.md`

**Interfaces:**

- Produces: `roxcoach.grant_access(p_user_id uuid, p_display_name text) returns void`, SQL exactly as in the spec ("Database"); execute only for `service_role`.

- [ ] **Step 1: Check the next free migration number** in `db/migrations` and how `db/tests/helpers/pglite.ts` applies migrations, creates roles (`anon`, `authenticated`, `service_role`) and switches role (`asSuperuser`, as-user helpers).
- [ ] **Step 2: Write the failing tests** (`grant-access-fn.test.ts`, node environment like `seed.test.ts`): sets `raw_app_meta_data.roxcoach = true` and creates the profile with the given name (Review Focus 4); keeps other `app_metadata` keys (`provider`); a second call changes nothing and keeps the first display name; an unknown id raises and creates no profile; `authenticated` and `anon` get a permission error when calling it, `service_role` succeeds (Review Focus 3). Adjust `seed.test.ts` expectations only if the wrapper changes observable behavior (it must not: unknown email still changes nothing, running twice is harmless).
- [ ] **Step 3: Run `pnpm test`.** Expected: FAIL (function missing).
- [ ] **Step 4: Implement** the migration (idempotent `create or replace`, `revoke`, `grant`) and rewrite `grant-access.sql` as the thin wrapper from the spec (keep both placeholders, the check query and the sign-out note, add that new users do not need it).
- [ ] **Step 5: Update the docs** (`database.md` migration table and provisioning paragraph, `db/README.md`). The migration must also be applied to the real Supabase project by the owner: say so in `db/README.md` and in the final report.
- [ ] **Step 6: Run `pnpm fmt && pnpm test && pnpm check && pnpm knip`.** Commit `feat: roxcoach.grant_access function`.

---

### Task 2: Access code helper, repository and sign-up service

**Files:**

- Create: `src/_bff/core/helpers/access-code.helper.ts`, `src/_bff/modules/auth/repositories/access-grant.repository.ts`, `src/_bff/modules/auth/services/sb-sign-up.service.ts`, and a `__tests__` file next to each
- Modify: `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`, `src/env/server.ts`

**Interfaces:**

- Produces: `isValidAccessCode(input: string, expected: string): boolean`. `grantAccess(supabase, userId, displayName)` (Effect, rpc `grant_access`, checks the `Effect.tryPromise` catch AND the returned `error`). `sbSignUp(input: { email: string; password: string; accessCode: string }, deps?: { expectedCode?: string; createAdminClient?; createServerClient? })` as an `Effect.fn('sbSignUp')` returning `{ status: 200 as const }`; defaults read `ServerEnv.NEXT_SIGNUP_ACCESS_CODE` and the real clients, tests pass fakes. Errors: `SignUpClosedError`, `InvalidAccessCodeError`, `CreateUserError`, `GrantAccessError` (each `cause: unknown`, `error_hash: ErrorCode`) plus the existing client and sign-in errors. Env: `NEXT_SIGNUP_ACCESS_CODE: z.string().min(16).optional()` in both blocks of `src/env/server.ts`; add it to `.env.example` if that file exists (do not read `.env*`).

- [ ] **Step 1: Write the failing tests.** Helper: equal, different, different length, empty input, empty expected, surrounding whitespace trimmed on the input, unicode. Service with fake clients: expected code undefined gives `SignUpClosedError` and no client call; wrong code gives `InvalidAccessCodeError` and NO client call (Review Focus 1); `createUser` returning an error gives `CreateUserError`, no grant, no delete; success path calls `createUser` with `email_confirm: true`, the password and NO `app_metadata`, then rpc with the new id and the display name derived from the email (local part, trimmed, 60 chars max), then `signInWithPassword` once, returns 200; grant failure (returned error and thrown) calls `deleteUser(id)` and fails with `GrantAccessError`; grant failure plus a failing `deleteUser` still fails with `GrantAccessError` and logs a cleanup line through the Logger without the code, the password or the key (Review Focus 2); a failing final sign-in gives a tagged sign-in error and does NOT delete the (granted) user.
- [ ] **Step 2: Run `pnpm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the helper (trim, `createHash('sha256')`, `timingSafeEqual` on the two digests), the repository, the service and the error classes and codes (`AUTH_SIGNUP_*`, eight-character codes in the style of the existing ones). The service uses `createDBAdminClient()` for steps 2 and 3 and `createDBServerClient()` for step 4, and follows `return yield*` for failures, no try/catch in `Effect.gen`.
- [ ] **Step 4: Run `pnpm fmt && pnpm test && pnpm check && pnpm knip`.** `sbSignUp` is not wired until Task 3: knip counts tests as usage. Commit `feat: sign-up service with access code`.

---

### Task 3: Controller and router

**Files:**

- Create: `src/_bff/modules/auth/controllers/sb-sign-up.controller.ts`, `controllers/__tests__/sb-sign-up.controller.test.ts`
- Modify: `src/_bff/modules/auth/auth.router.ts`, the router test if there is one, `docs/tech-specs/architecture.md` (auth module table)

**Interfaces:**

- Consumes: `sbSignUp` (Task 2).
- Produces: `SB_SIGN_UP_PUBLIC_CONTROLLER` (`publicProcedure`, input `z.object({ email: z.email(), password: z.string().min(8).max(72), accessCode: z.string().min(1) })`, mutation) and `AUTH_ROUTER.signUp`. Exhaustive `Match.tag`: client creation errors map to `INTERNAL_SERVER_ERROR`; `SignUpClosedError`, `InvalidAccessCodeError`, `CreateUserError`, `GrantAccessError` and the sign-in errors all map to `UNAUTHORIZED`, with one constant client message ("Could not create your account. Check your details and access code.") and the distinct `error_hash` only in the logs, like `sb-login.controller.ts`.

- [ ] **Step 1: Write the failing tests** following `sb-login.controller.test.ts`: every error tag gives the same tRPC code and the same message (Review Focus 1); zod rejects a bad email, a password of 7 and of 73 characters and an empty code; success returns `{ status: 200 }`.
- [ ] **Step 2: Run `pnpm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the controller (one file, one exported constant) and register `signUp` in `AUTH_ROUTER`. Update the architecture doc.
- [ ] **Step 4: Run `pnpm fmt && pnpm test && pnpm check && pnpm knip`.** Commit `feat: auth.signUp procedure`.

---

### Task 4: Proxy rules and constants

**Files:**

- Modify: `src/_bff/core/constants/auth.constants.ts`, `src/_bff/core/helpers/auth-redirect.helper.ts`, `src/_bff/core/helpers/__tests__/auth-redirect.helper.test.ts` (path may differ), `docs/tech-specs/auth-security.md` (redirect table)

**Interfaces:**

- Produces: `SIGNUP_PAGE_PATH = '/signup'`, `PUBLIC_AUTH_PATHS = [AUTH_PAGE_PATH, SIGNUP_PAGE_PATH]`. `decideAuthRedirect` sends a request with access under any public auth path to `DEFAULT_POST_AUTH_PATH`; `/signup` is not in `PROTECTED_PATHS`.

- [ ] **Step 1: Write the failing tests** (Review Focus 5): `/signup` with access redirects to `/dashboard`; `/signup` anonymous and flagless pass through; `/signup/` and `/%73ignup` with access redirect; `/signupx` passes; the existing `/login` cases still pass.
- [ ] **Step 2: Run `pnpm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the constants and the rule; update the redirect table in `auth-security.md`.
- [ ] **Step 4: Run `pnpm fmt && pnpm test && pnpm check && pnpm knip`.** Commit `feat: treat /signup as a public auth page in the proxy`.

---

### Task 5: Page, card and navigation

**Files:**

- Create: `src/app/(auth)/signup/page.tsx`, `src/modules/auth/signup-card.tsx`, `src/modules/auth/use-signup-form.ts`, `src/modules/auth/__tests__/signup-card.test.tsx`
- Modify: `src/app/(auth)/login/page.tsx`, `src/modules/auth/login-card.tsx` (link, shown only when sign-up is open), `src/modules/auth/__tests__/login-card.test.tsx`

**Interfaces:**

- Consumes: `trpc.auth.signUp` (Task 3), `SIGNUP_PAGE_PATH` (Task 4), `ServerEnv.NEXT_SIGNUP_ACCESS_CODE`.
- Produces: `SignupCard` (no props) and `useSignupForm()` (`FormValues` = `{ email, password, accessCode }`, zod: valid email, password 8 to 72, non-empty code). The signup page is a Server Component: `await connection()`, then `notFound()` when the env is unset. The login page passes a boolean `signupOpen` prop to `LoginCard`, which renders the link (`signup-link`) only when true. Follow `LoginCard` for layout, `queryClient.clear()`, `router.replace('/dashboard')`, `router.refresh()`.

- [ ] **Step 1: Write the failing tests** with the fake tRPC from `src/lib/__mocks__/trpc.ts` and `routeTrpc` (same pattern as `login-card.test.tsx`), test ids only: renders `signup-card` with the three inputs and the correct `autocomplete` attributes; required-field and short-password validation block the submit; a rejected mutation shows `signup-error` with the generic copy and keeps the values; success clears the cache and redirects; the link to `/login` (`signup-login-link`) exists; `LoginCard` shows `signup-link` only when `signupOpen` (Review Focus 6). The 404 behavior of the page is covered by a small test of an extracted pure helper if one exists, otherwise it is checked in the final manual step.
- [ ] **Step 2: Run `pnpm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the hook, card, page and the login link. English copy: title "Create your account", button "Create account", link texts as in the spec.
- [ ] **Step 4: Update the docs:** `auth-security.md` (Account provisioning, the "no sign-up route" sentence, new "Sign-up page" section), `README.md` (decisions log, out-of-scope line, module index row), `ux-design.md` (the screen), `architecture.md` (env table).
- [ ] **Step 5: Run `pnpm fmt && pnpm test && pnpm check && pnpm knip`.** Commit `feat: sign-up page with access code`.

---

### Task 6: Final verification

- [ ] **Step 1: Run `pnpm fmt && pnpm check && pnpm knip && pnpm test`** and fix whatever fails.
- [ ] **Step 2: Review each Review Focus item** against the tests and confirm every one has a test that would fail without the behavior.
- [ ] **Step 3: Grep for leaks:** no `console.log`, no occurrence of the access code variable in any log or error payload, no em-dash characters in the diff, no `app_metadata` passed to `createUser`.
- [ ] **Step 4: Manual check with the owner** (needs the real Supabase project, so it is the owner's step): apply migration `0017` in the SQL editor, set `NEXT_SIGNUP_ACCESS_CODE` (16 or more characters) locally, sign up with a new email, confirm the redirect to `/dashboard`, confirm in the SQL editor that the new user has `raw_app_meta_data.roxcoach = true` and one `athlete_profiles` row, try a wrong code and an existing email and confirm the identical message, unset the variable and confirm `/signup` is a 404 and `/login` has no link.
- [ ] **Step 5: Follow-up to propose, not build:** rate limiting for the public endpoint (see the spec, "Risks").
