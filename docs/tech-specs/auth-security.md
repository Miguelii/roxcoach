# Auth and security

The Supabase implementation is the same as BrewStock's, reduced to what a single, pre-created user
needs: email and password login, session refresh in the proxy, protected routes, CSP.

## Account provisioning

The Supabase project is shared with another app, so its users and its Auth settings are not Roxcoach's
to change.

- The user already exists in `auth.users` if they use the other app, or is created by hand in the
  Supabase dashboard (Authentication, Users, email + password, auto-confirmed).
- **Access is an explicit flag.** A one-time SQL snippet, `db/seed/grant-access.sql` (run as
  `postgres` in the SQL editor, steps in `db/README.md`), grants it through
  `roxcoach.grant_access`, which runs this statement:
  `update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"roxcoach": true}'::jsonb where email = '<email>';`
  The flag appears in the JWT as `app_metadata.roxcoach` after the next sign-in. Only the service role
  can write `app_metadata`, so a user cannot grant it to themselves.
- Then insert the matching `athlete_profiles` row (same seed snippet).
- **New users** can instead sign up on `/signup` with the shared access code. The server creates the
  confirmed user and calls the same grant (`roxcoach.grant_access`, migration `0017`), so nothing
  runs by hand. The script stays for accounts that already exist (see
  [signup-access-code.md](signup-access-code.md)).
- Do **not** disable "Allow new users to sign up": the other app may depend on it. Roxcoach's own
  sign-up goes through the admin API, and the access flag makes any account created elsewhere
  useless here.
- No password reset, OTP or OAuth login in Roxcoach. If the password is lost it is reset in the
  dashboard (this also affects the other app if it is the same account).

## Access gate

Being signed in is not enough. Every entry point checks the flag:

| Layer                | Check                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Proxy (`sbProxy`)    | after `getClaims()`, a claim without `app_metadata.roxcoach === true` is treated as no user on protected paths: redirect to `/login` |
| `protectedProcedure` | `getSession()` returns the user, the middleware also requires `user.app_metadata.roxcoach === true`, otherwise `FORBIDDEN`           |
| Database             | `roxcoach.has_access()` in every RLS policy (see [database.md](database.md))                                                         |

### Admin flag

Some pages are for admins only (today `/logs`, see [logs.md](logs.md)). An admin is a user with
access whose `app_metadata.roxcoach_admin === true` (strict boolean), checked by
`isRoxcoachAdmin` in `src/_bff/core/helpers/access.helper.ts` (it also requires the access flag).
Like the access flag, only the service role can write it, so a user cannot make themselves an
admin, and `user_metadata` is never read. It is granted with `db/seed/grant-admin.sql` (steps in
`db/README.md`), never by the app.

| Layer            | Check                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Proxy            | a path under `ADMIN_PATHS` needs the flag in the JWT claims: signed out goes to `/login`, access without it to `/dashboard` |
| `adminProcedure` | `protectedProcedure` plus the flag on the live user (`getUser()`), otherwise `FORBIDDEN`                                    |
| App shell        | the Logs sidebar link renders only when `getCachedClaims().isAdmin` (UI only, never an authorization decision)              |

Granting and revoking behave like the access flag: the proxy and the sidebar follow the JWT (a new
sign-in to grant, up to about 1 hour to revoke), `adminProcedure` refuses a revoked admin at once.

The proxy and `roxcoach.has_access()` (RLS) both read the flag from the JWT claims, so revoking
`app_metadata.roxcoach` only takes effect in them when the access token is reissued (it expires
after about 1 hour by default). Only `protectedProcedure` is immediate: `getSession()` calls
`getUser()`, which asks Supabase Auth for the current user, so a revoked flag gives `FORBIDDEN` at
once there. Granting the flag works the other way round: the user must sign in again, because the
flag reaches the JWT only with a new access token. `user_metadata` is never read, since users can
write it themselves through `auth.updateUser`.

`sb-login` calls `signInWithPassword`, then checks the returned user's `app_metadata.roxcoach`. When
it is missing it signs out at once and returns the same generic failure as a wrong password, so the
page never reveals that the account exists in the other app.

## Login page

| Item              | Spec                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ |
| Route             | `/login` (the only public page)                                                      |
| Fields            | email, password (react-hook-form + zod in `use-login-form.ts`)                       |
| Submit            | `useMutation(trpc.auth.login.mutationOptions())`                                     |
| Success           | redirect to `/dashboard`                                                             |
| Failure           | one generic message ("Invalid email or password"), never reveal which part was wrong |
| Already signed in | the proxy redirects `/login` to `/dashboard`                                         |
| Sign-up           | a link to `/signup` shows only while sign-up is open                                 |
| Logout            | app shell action calling `auth.logout` (local scope), then redirect to `/login`      |

The login form follows BrewStock's form pattern and visual style (see
[ux-design.md](ux-design.md)). There is no marketing content on the page.

## Sign-up page

`/signup` (email, password, access code) creates an account and grants access in one step. It is
specified in [signup-access-code.md](signup-access-code.md): the code check, the admin
`createUser`, `roxcoach.grant_access`, the cleanup on failure, the generic failure and the
`NEXT_SIGNUP_ACCESS_CODE` env var (unset means closed).

## Session and proxy

`src/proxy.ts` composes two steps, in order:

1. `sbProxy(request)` (in `src/lib/utils.server.ts`): creates a per-request Supabase client with
   cookie handlers, calls `supabase.auth.getClaims()` to refresh the session, and syncs cookies
   between request and response. Nothing may run between creating the client and `getClaims()`.
2. `setCSP(response)` (`src/lib/set-csp.ts`): sets the Content-Security-Policy header. It keeps any
   Cache-Control already on the response (Supabase's `private, no-cache, no-store` when the session was
   refreshed) and otherwise sets `private, no-cache, no-store, must-revalidate`, because every page
   except `/login` is per-user and there are no public pages. A response is never marked `public`.

Redirect rules in `sbProxy`:

| Condition                                              | Result                              |
| ------------------------------------------------------ | ----------------------------------- |
| No claims and path starts with a protected path        | redirect to `/login`                |
| Claims without the flag on a protected path            | redirect to `/login`                |
| No claims or no flag on an admin path                  | redirect to `/login`                |
| Claims with the flag, no admin flag, on an admin path  | redirect to `/dashboard`            |
| Claims with the flag and path is `/login` or `/signup` | redirect to `/dashboard`            |
| Anything else                                          | pass through with refreshed cookies |

The decision is the pure function `decideAuthRedirect` in
`src/_bff/core/helpers/auth-redirect.helper.ts`. A protected prefix only matches on a path-segment
boundary (`/calendar` and `/calendar/1` match, `/calendarx` does not). Redirects carry the refreshed
session cookies and Supabase's no-cache headers, like the pass-through response, and `setCSP` keeps
those headers, so a response that sets a session cookie is never cacheable.

Constants in `src/_bff/core/constants/auth.constants.ts` (importable from client code):
`AUTH_PAGE_PATH = '/login'`, `SIGNUP_PAGE_PATH = '/signup'`,
`PUBLIC_AUTH_PATHS = [AUTH_PAGE_PATH, SIGNUP_PAGE_PATH]`, `DEFAULT_POST_AUTH_PATH = '/dashboard'`,
`PROTECTED_PATHS = ['/dashboard', '/calendar', '/activities', '/races', '/settings']`,
`ADMIN_PATHS = ['/logs']` (protected too, and also need the admin flag).

The proxy matcher excludes `_next`, `api/` (route handlers there authenticate themselves),
static assets (`public/assets/`, the PWA icons), the favicon, `robots.txt` and `sitemap.xml`, so
crawlers and share-card scrapers read them without a session. It is defined in `src/proxy.ts`.

`safeReturnTo(returnTo, fallback = DEFAULT_POST_AUTH_PATH)` in
`src/_bff/core/helpers/safe-redirect.helper.ts` replaces BrewStock's `safeRedirectUrl`, so any return
parameter cannot redirect off-origin. It fully decodes the value first and accepts it only when both
the raw and decoded forms are same-site absolute paths: protocol-relative, backslash, absolute,
`javascript:` and control-character forms (including percent-encoded and double-encoded variants),
dot segments that resolve to a protocol-relative path (`/.//evil.com`) and non-string values (a
`string[]` search param) give the fallback.

## Supabase clients

`src/_bff/core/db/index.ts` (server only), identical to BrewStock:

| Function                     | Key                              | Used for                                                 |
| ---------------------------- | -------------------------------- | -------------------------------------------------------- |
| `createDBServerClient()`     | publishable key, cookie session  | tRPC services acting as the logged-in user (RLS applies) |
| `createDBServerClient(true)` | service-role key, cookie session | not an admin client, see below                           |
| `createDBAdminClient()`      | service-role key, no cookies     | server-side admin work                                   |

`createDBServerClient(true)` is not a reliable way to act as the service role. When a cookie
session exists, supabase-js sends the user's access token instead of the key, so PostgREST runs as
`authenticated` under RLS, with that user's policies and flag. It acts as the
service role only when nobody is signed in. Use `createDBAdminClient()` for admin work.

Every client is created with `db: { schema: 'roxcoach' }` so table names resolve inside the
Roxcoach schema and never in `public`. A new client is created on every request. Services pick the key and pass the client into
repositories.

## Auth module (`src/_bff/modules/auth/`)

| File                                      | Purpose                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `controllers/sb-login.controller.ts`      | public procedure, input `{ email, password }`                          |
| `controllers/sb-logout.controller.ts`     | public procedure (must work with an expired or unflagged session)      |
| `controllers/sb-sign-up.controller.ts`    | public procedure, input `{ displayName, email, password, accessCode }` |
| `services/sb-sign-up.service.ts`          | access code check, admin `createUser`, grant, sign-in                  |
| `repositories/access-grant.repository.ts` | rpc `roxcoach.grant_access`                                            |
| `helpers/access-code.helper.ts`           | constant-time code comparison                                          |
| `services/sb-login.service.ts`            | `signInWithPassword`, tagged errors                                    |
| `services/sb-logout.service.ts`           | `signOut({ scope: 'local' })`                                          |
| `services/get-session.service.ts`         | `getUser()` via React `cache()` (RSC); tRPC memoizes it in the context |
| `services/get-cached-claims.service.ts`   | `getClaims()` for rendering UI without a network call                  |

Copied from BrewStock, minus the OTP services and the OAuth callback route. `protectedProcedure`
in `src/_bff/trpc/server.ts` matches BrewStock's (it runs `getSession()`, returns 401 without a
user and 500 on infrastructure failure) and adds one check: it returns 403 (`FORBIDDEN`) when the
signed-in user lacks `app_metadata.roxcoach === true`.

Logout uses the local scope (`signOut({ scope: 'local' })`). The default global scope would revoke
every refresh token of the shared `auth.users` row, signing the same account out of the other app
and of every other device. Local scope ends only this browser's session.

## Authorization

- Every protected tRPC procedure uses `protectedProcedure` and filters by `ctx.user.id`.
- RLS is the second layer: even a repository bug cannot read another user's rows (see
  [database.md](database.md)).
- Route handlers under `api/` use the service-role client only after verifying their own inputs.

## Content Security Policy

Already implemented in `src/lib/set-csp.ts`: `default-src 'self'`, `frame-ancestors 'none'`,
`object-src 'none'`, `upgrade-insecure-requests`, `'unsafe-eval'` in development only.

All Gemini calls are server-side, so `connect-src` stays `'self'`.

## Security headers

Add the same static headers BrewStock sets in `next.config.ts` `headers()`: `X-Content-Type-Options`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security`,
`X-Xss-Protection: 0`, `Permissions-Policy` with camera, microphone, geolocation and
browsing-topics denied.

## Secrets

- All secrets in env vars (see [architecture.md](architecture.md)), validated at startup by
  `@t3-oss/env-nextjs`.
