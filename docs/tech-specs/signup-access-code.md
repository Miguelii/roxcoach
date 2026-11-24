# Sign-up with an access code

A public `/signup` page where a new user enters an email, a password and a shared access code. A
correct code creates the account and grants Roxcoach access automatically, so nobody has to run
`db/seed/grant-access.sql` by hand for new users. It is the same grant as that script, called from
the app.

## Goals and non-goals

- Goal: self-service onboarding for people the owner gave the access code to. One page, three
  fields, no email step.
- Goal: the grant (flag plus `athlete_profiles` row) is exactly what `grant-access.sql` does, in
  one transaction, with no manual SQL.
- Non-goal: invitations, per-user codes, email verification, password reset, OAuth, rate limiting
  infrastructure (see Risks).
- Non-goal: granting access to an account that already exists (for example a user of the other app
  that shares the Supabase project). That stays a manual `grant-access.sql` run, because granting by
  email alone would let anyone with the code take over the flag of someone else's account.

## Why a SQL function and not raw SQL from the app

supabase-js cannot run arbitrary SQL, and the app must never hold a database superuser connection.
The grant is moved into a `security definer` function, `roxcoach.grant_access`, that only the
service role can execute. The app calls it with `supabase.rpc`. The statement inside is the one in
`grant-access.sql`, so the manual script and the automatic path cannot drift: the script is
rewritten to call the function (see Database).

## Flow

```
/signup form ──► trpc auth.signUp (public) ──► sbSignUp service
                                                 1. code check (constant time), else generic failure
                                                 2. admin.createUser(email, password, email_confirm: true)
                                                 3. rpc roxcoach.grant_access(user_id, display_name)
                                                    on failure: admin.deleteUser(user_id), generic failure
                                                 4. signInWithPassword on the cookie client (flag is in the JWT)
                                                 5. { status: 200 }
         success ──► router.replace('/dashboard') + router.refresh()
```

- Step 2 uses the admin client (`createDBAdminClient()`), never the user client. The user is
  created confirmed, so no email is sent and the shared project's email settings are not touched.
  `app_metadata` is not passed to `createUser`: the flag is written only by the SQL function, so
  there is a single place that grants access.
- Step 4 runs after the grant, so the first token already carries `app_metadata.roxcoach`. This is
  why no sign-out and sign-in is needed, unlike the manual grant.
- Step 3 failing after step 2 succeeded leaves a flagless orphan user. The service deletes it
  (`admin.deleteUser`) so the email is not blocked. A failed cleanup is logged with its own tag and
  the request still fails.
- If the email already exists, `createUser` fails and the response is the generic failure. The
  page never reveals which of "bad code", "email taken" or "grant failed" happened.

## Access code

- A single shared secret in `NEXT_SIGNUP_ACCESS_CODE` (server env, never exposed to the client).
- Declared in `src/env/server.ts` as `z.string().min(1).optional()`. **Unset means sign-up is
  closed**: the page calls `notFound()` and `auth.signUp` always returns the generic failure. This
  is the default, so deploying the code without setting the variable opens nothing.
- Compared in constant time: both sides are hashed with SHA-256 and the digests are compared with
  `crypto.timingSafeEqual`. A plain `===` leaks the length and prefix through timing.
- The code is trimmed before comparing. It is never logged, never in an error payload, never in a
  URL (the form posts it in the tRPC body).
- The code can be short (the owner chooses it, for example `MIGUELINR1`). The form writes the code in capitals as the user types, so the configured code must be in capitals. A short code is easy to guess, which makes the missing rate limit (see Risks) matter more.
- Rotating the code is changing the env var and redeploying. Existing users are unaffected.

## Database

Migration `0017_grant_access_fn.sql` (next free number at implementation time):

```sql
create or replace function roxcoach.grant_access(p_user_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"roxcoach": true}'::jsonb
    where id = p_user_id;

    if not found then
        raise exception 'user % does not exist', p_user_id;
    end if;

    insert into roxcoach.athlete_profiles (user_id, display_name)
    values (p_user_id, p_display_name)
    on conflict (user_id) do nothing;
end;
$$;

revoke all on function roxcoach.grant_access(uuid, text) from public, anon, authenticated;
grant execute on function roxcoach.grant_access(uuid, text) to service_role;
```

- It is atomic: the flag and the profile are written together or not at all.
- Idempotent like the script: the flag is merged into `app_metadata` (other keys kept), an existing
  profile is left as it is.
- `set search_path = ''` and fully qualified names, as for every `security definer` function in
  this schema. Only `service_role` can execute it, so a signed-in user cannot grant themselves
  access by calling it through PostgREST. This is tested (see Tests).
- `roxcoach` is already reached through clients created with `db: { schema: 'roxcoach' }`, so
  `rpc('grant_access', ...)` on the admin client resolves to it. It does not change the other
  app's objects.
- `db/seed/grant-access.sql` becomes a thin wrapper:
  `select roxcoach.grant_access(id, '<DISPLAY_NAME>') from auth.users where email = '<EMAIL>';`
  (an email that matches no user calls nothing and changes nothing, as today) plus the same check
  query. The existing `db/tests/seed.test.ts` keeps passing: it still finds both placeholders. Its header keeps the sign-out and sign-in note (the manual path still
  needs it) and says that new users do not need it.

## Backend (`src/_bff/modules/auth/`)

| File                                      | Purpose                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `controllers/sb-sign-up.controller.ts`    | `SB_SIGN_UP_PUBLIC_CONTROLLER`, input `{ displayName, email, password, accessCode }`                          |
| `services/sb-sign-up.service.ts`          | the flow above, `Effect.fn('sbSignUp')`                                                                       |
| `repositories/access-grant.repository.ts` | `grantAccess(supabase, userId, displayName)` wrapping the rpc, both error paths                               |
| `helpers/access-code.helper.ts`           | `isValidAccessCode(input, expected)`: trim, SHA-256, `timingSafeEqual` (in the module: it uses `node:crypto`) |

- Input zod: `email: z.email()`, `password: z.string().min(8).max(72)` (bcrypt limit),
  `accessCode: z.string().min(1)`. The access code is a plain string, so the controller does not
  leak the required length.
- `displayName` is a form field (`z.string().trim().min(1).max(60)`), saved as
  `athlete_profiles.display_name`. The user can change it later in Settings.
- The repository takes the admin client then the new user's id. It does not filter by `user_id`
  like other repositories because it is the grant itself (documented in the file).
- Errors (`src/_bff/lib/errors.ts`, codes in `error-codes.ts`): `SignUpClosedError` (env unset),
  `InvalidAccessCodeError`, `CreateUserError`, `GrantAccessError`. The controller maps all of
  them to `UNAUTHORIZED` and logs the distinct `error_hash`. The tRPC message is one constant code
  (`AUTH_SIGNUP_FAILED`) and the UI shows one constant copy ("Could not create your account. Check
  your details and access code."). A failure creating a client
  maps to `INTERNAL_SERVER_ERROR`, like login.
- The service uses `createDBAdminClient()` and the auth module's own repository, and imports
  nothing from other modules. Controller and service are public, as login is.

## Frontend

| Item              | Spec                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route             | `/signup`, public, `src/app/(auth)/signup/page.tsx`                                                                                                                                                                                |
| Component         | `src/modules/auth/signup-card.tsx`, hook `use-signup-form.ts` (zod schema and `FormValues`)                                                                                                                                        |
| Fields            | name, email, password, access code (all required), submit button                                                                                                                                                                   |
| Submit            | `useMutation(trpc.auth.signUp.mutationOptions())`, then `queryClient.clear()`, `router.replace('/dashboard')`, `router.refresh()`, like `LoginCard`                                                                                |
| Failure           | one inline generic message (above); the form keeps its values                                                                                                                                                                      |
| Closed            | the page calls `notFound()` when `NEXT_SIGNUP_ACCESS_CODE` is unset; `/login` hides the link (`SignupLink`, a small request-time hole, so the login card itself is in the static shell; `returnTo` is read from the URL at submit) |
| Navigation        | `/login` shows "Have an access code? Create an account"; `/signup` shows "Already have an account? Sign in"                                                                                                                        |
| Already signed in | the proxy redirects `/signup` to `/dashboard`, as for `/login`                                                                                                                                                                     |

- It reuses the `LoginCard` layout and components (shadcn base-ui, tokens, `cn()`), no marketing
  content. The password input has `autocomplete="new-password"` and an eye button
  (`signup-password-toggle`) that shows or hides it; the code input is always visible, in capitals,
  with `autocomplete="off"`. Test ids: `signup-card`, `signup-name`, `signup-email`, `signup-password`,
  `signup-access-code`, `signup-submit`, `signup-error`, `signup-login-link`.
- The page is a Server Component that reads the env, so it must call `await connection()` before
  reading it, as the dashboard page does for cacheComponents.

## Proxy and constants

- `src/_bff/core/constants/auth.constants.ts`: add `SIGNUP_PAGE_PATH = '/signup'` and
  `PUBLIC_AUTH_PATHS = [AUTH_PAGE_PATH, SIGNUP_PAGE_PATH]`.
- `decideAuthRedirect`: a request with access on a path under any public auth path goes to
  `DEFAULT_POST_AUTH_PATH`. `/signup` is not protected, so an anonymous visitor passes through.
  Tested with the same encoded-path cases as `/login`.
- The `src/proxy.ts` matcher is unchanged (it already covers `/signup`).

## Env

| Variable                  | Where               | Notes                                                                                                 |
| ------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `NEXT_SIGNUP_ACCESS_CODE` | `src/env/server.ts` | optional, any length, unset closes sign-up; add to `.env.example` and the `architecture.md` env table |

## Security

- The flag is written only by `roxcoach.grant_access`, callable only by the service role, only
  from the server after a correct code. `user_metadata` is never read or written.
- Responses for bad code, closed sign-up, taken email and grant failure are identical, so the form
  is not an oracle for the code or for the other app's user list. A bad code returns before any
  call to Supabase; a taken email does one more call, so a small timing difference remains between
  those two cases.
- No secret is logged: not the code, not the password, not the service-role key. Logs carry the
  `error_hash` and the user id only.
- The CSP is unaffected: the form posts to `/api/trpc` (`connect-src 'self'`).
- Open sign-ups on the shared project were already possible with the public key and stay harmless
  for Roxcoach: an account without the flag has no access. This feature does not change that.

## Risks and follow-ups

- **No rate limiting.** A guessable code can be brute forced through the public endpoint.
  Mitigations in v1: constant-time compare and nothing
  that distinguishes the failure cases. If the code is shared widely, add a throttle (a small table
  keyed by hashed IP with a window count, or the platform's rate limit) before launch. A follow-up,
  not part of this change.
- A shared code cannot be revoked per person. Access lasts until the flag is removed in SQL:
  `update auth.users set raw_app_meta_data = raw_app_meta_data - 'roxcoach' where id = ...`.
- A person who already has an account on the other app gets the generic failure and needs the
  manual script. The page does not explain this, by design.

## Tests

- `isValidAccessCode`: equal, different, different length, empty, surrounding whitespace, unicode.
- `sbSignUp` with fake admin and cookie clients (no module mocks): closed (env unset), bad code
  makes no Supabase call, create fails, grant fails then `deleteUser` is called, grant fails and
  `deleteUser` also fails (still the generic failure, cleanup logged), success signs in once and
  returns 200, the trimmed display name is passed to the grant.
- Controller: every error tag maps to `UNAUTHORIZED`, the client message is constant and equal
  across cases, zod rejects a short password and a bad email.
- `decideAuthRedirect`: `/signup` redirects when signed in with access, passes when anonymous,
  encoded variants.
- `SignupCard` with the fake tRPC (`src/lib/__mocks__/trpc.ts`): renders, validates required
  fields, shows the generic error on rejection, redirects on success, locators only by test id.
- DB (PGlite suites in `db/tests/`): `grant_access` sets the flag and creates the profile, merges
  into existing `app_metadata`, is idempotent, raises for an unknown user, and is **not**
  executable by `anon` or `authenticated`.

## Docs to update in the same change

- `auth-security.md`: "Account provisioning" (new path plus the manual one for existing accounts),
  the "no sign-up route, form or tRPC procedure" sentence, a "Sign-up page" section.
- `README.md`: decisions log ("Users", "Login"), the out-of-scope line about a second athlete's
  sign-up, and a module index row for this spec.
- `database.md`: migration table (`0017`), the provisioning paragraph.
- `db/README.md` and the header of `db/seed/grant-access.sql`.
- `architecture.md`: env table and the auth module file table.
- `ux-design.md`: the sign-up screen.
