# Auth and security

The Supabase implementation is the same as BrewStock's, reduced to what a single, pre-created user
needs: email and password login, session refresh in the proxy, protected routes, CSP.

## Account provisioning

The Supabase project is shared with another app, so its users and its Auth settings are not Roxcoach's
to change.

- The user already exists in `auth.users` if they use the other app, or is created by hand in the
  Supabase dashboard (Authentication, Users, email + password, auto-confirmed).
- **Access is an explicit flag.** A one-time SQL snippet, `db/seed/grant-access.sql` (run as
  `postgres` in the SQL editor, steps in `db/README.md`), grants it:
  `update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"roxcoach": true}'::jsonb where email = '<email>';`
  The flag appears in the JWT as `app_metadata.roxcoach` after the next sign-in. Only the service role
  can write `app_metadata`, so a user cannot grant it to themselves.
- Then insert the matching `athlete_profiles` row (same seed snippet).
- Do **not** disable "Allow new users to sign up": the other app may depend on it. Roxcoach does not
  need it, because there is no sign-up route, form or tRPC procedure, and because the access flag
  makes any other account useless here.
- No password reset, OTP or OAuth login in Roxcoach. If the password is lost it is reset in the
  dashboard (this also affects the other app if it is the same account).

## Access gate

Being signed in is not enough. Every entry point checks the flag:

| Layer                | Check                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Proxy (`sbProxy`)    | after `getClaims()`, a claim without `app_metadata.roxcoach === true` is treated as no user on protected paths: redirect to `/login` |
| `protectedProcedure` | `getSession()` returns the user, the middleware also requires `user.app_metadata.roxcoach === true`, otherwise `FORBIDDEN`           |
| Database             | `roxcoach.has_access()` in every RLS policy (see [database.md](database.md))                                                         |

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
| Submit            | `trpcClient.auth.login.useMutation()`                                                |
| Success           | redirect to `/dashboard`                                                             |
| Failure           | one generic message ("Invalid email or password"), never reveal which part was wrong |
| Already signed in | the proxy redirects `/login` to `/dashboard`                                         |
| Logout            | app shell action calling `auth.logout` (local scope), then redirect to `/login`      |

The login form follows BrewStock's form pattern and visual style (see
[ux-design.md](ux-design.md)). There is no marketing content on the page.

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

| Condition                                       | Result                              |
| ----------------------------------------------- | ----------------------------------- |
| No claims and path starts with a protected path | redirect to `/login`                |
| Claims without the flag on a protected path     | redirect to `/login`                |
| Claims with the flag and path is `/login`       | redirect to `/dashboard`            |
| Anything else                                   | pass through with refreshed cookies |

The decision is the pure function `decideAuthRedirect` in
`src/_bff/core/helpers/auth-redirect.helper.ts`. A protected prefix only matches on a path-segment
boundary (`/plan` and `/plan/1` match, `/plans-extra` does not). Redirects carry the refreshed
session cookies and Supabase's no-cache headers, like the pass-through response, and `setCSP` keeps
those headers, so a response that sets a session cookie is never cacheable.

Constants in `src/_bff/core/constants/auth.constants.ts` (importable from client code):
`AUTH_PAGE_PATH = '/login'`, `DEFAULT_POST_AUTH_PATH = '/dashboard'`,
`PROTECTED_PATHS = ['/dashboard', '/coach', '/activities', '/plan', '/races', '/settings']`.

The proxy matcher excludes `_next`, `api/` (route handlers there authenticate themselves),
static assets and the favicon. It is already defined in `src/proxy.ts` and only needs `sbProxy`
added.

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

| File                                    | Purpose                                                           |
| --------------------------------------- | ----------------------------------------------------------------- |
| `controllers/sb-login.controller.ts`    | public procedure, input `{ email, password }`                     |
| `controllers/sb-logout.controller.ts`   | public procedure (must work with an expired or unflagged session) |
| `services/sb-login.service.ts`          | `signInWithPassword`, tagged errors                               |
| `services/sb-logout.service.ts`         | `signOut({ scope: 'local' })`                                     |
| `services/get-session.service.ts`       | `getUser()` once per request via React `cache()`                  |
| `services/get-cached-claims.service.ts` | `getClaims()` for rendering UI without a network call             |

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
