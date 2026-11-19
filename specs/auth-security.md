# Auth and security

The Supabase implementation is the same as BrewStock's, reduced to what a single, pre-created user
needs: email and password login, session refresh in the proxy, protected routes, CSP.

## Account provisioning

The Supabase project is shared with another app, so its users and its Auth settings are not Roxcoach's
to change.

- The user already exists in `auth.users` if they use the other app, or is created by hand in the
  Supabase dashboard (Authentication, Users, email + password, auto-confirmed).
- **Access is an explicit flag.** A one-time SQL snippet in `db/seed/` grants it:
  `update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"roxcoach": true}' where email = '<email>';`
  The flag appears in the JWT as `app_metadata.roxcoach` after the next sign-in. Only the service role
  can write `app_metadata`, so a user cannot grant it to themselves.
- Then insert the matching `athlete_profiles` row (same seed snippet).
- Do **not** disable "Allow new users to sign up": the other app may depend on it. Roxcoach does not
  need it, because there is no sign-up route, form or tRPC procedure, and because the access flag
  makes any other account useless here.
- No password reset, OTP or OAuth login in Roxcoach. If the password is lost it is reset in the
  dashboard (this also affects the other app if it is the same account).

## Access gate

Being signed in is not enough. Three layers check the flag:

| Layer                | Check                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Proxy (`sbProxy`)    | after `getClaims()`, a claim without `app_metadata.roxcoach === true` is treated as no user on protected paths: redirect to `/login` |
| `protectedProcedure` | `getSession()` returns the user, the middleware also requires `user.app_metadata.roxcoach === true`, otherwise `FORBIDDEN`           |
| Database             | `roxcoach.has_access()` in every RLS policy (see [database.md](database.md))                                                         |

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
| Logout            | action in the app shell calling `auth.logout`, then redirect to `/login`             |

The login form follows BrewStock's form pattern and visual style (see
[ux-design.md](ux-design.md)). There is no marketing content on the page.

## Session and proxy

`src/proxy.ts` composes two steps, in order:

1. `sbProxy(request)` (in `src/lib/utils.server.ts`): creates a per-request Supabase client with
   cookie handlers, calls `supabase.auth.getClaims()` to refresh the session, and syncs cookies
   between request and response. Nothing may run between creating the client and `getClaims()`.
2. `setCSP(response)`: sets the Content-Security-Policy and Cache-Control headers
   (`src/lib/set-csp.ts`, already in place).

Redirect rules in `sbProxy`:

| Condition                                       | Result                              |
| ----------------------------------------------- | ----------------------------------- |
| No claims and path starts with a protected path | redirect to `/login`                |
| Claims present and path is `/login`             | redirect to `/dashboard`            |
| Anything else                                   | pass through with refreshed cookies |

Constants in `src/lib/constants.ts` (used by the proxy, so also needed in `_bff` if shared, then
promoted to `src/_bff/core/constants/auth.constants.ts`):
`AUTH_PAGE_PATH = '/login'`, `DEFAULT_POST_AUTH_PATH = '/dashboard'`,
`PROTECTED_PATHS = ['/dashboard', '/activities', '/plan', '/races', '/settings']`.

The proxy matcher excludes `_next`, `api/` (webhook and OAuth callback authenticate themselves),
static assets and the favicon. It is already defined in `src/proxy.ts` and only needs `sbProxy`
added.

`safeRedirectUrl(next, siteUrl)` from BrewStock is ported so any `next` parameter cannot redirect
off-origin.

## Supabase clients

`src/_bff/core/db/index.ts` (server only), identical to BrewStock:

| Function                     | Key                              | Used for                                                 |
| ---------------------------- | -------------------------------- | -------------------------------------------------------- |
| `createDBServerClient()`     | publishable key, cookie session  | tRPC services acting as the logged-in user (RLS applies) |
| `createDBServerClient(true)` | service-role key, cookie session | rare server-side admin needs                             |
| `createDBAdminClient()`      | service-role key, no cookies     | Trigger.dev jobs, webhook handler, Strava token storage  |

Every client is created with `db: { schema: 'roxcoach' }` so table names resolve inside the
Roxcoach schema and never in `public`. A new client is created on every request. Services pick the key and pass the client into
repositories.

## Auth module (`src/_bff/modules/auth/`)

| File                                    | Purpose                                                           |
| --------------------------------------- | ----------------------------------------------------------------- |
| `controllers/sb-login.controller.ts`    | public procedure, input `{ email, password }`                     |
| `controllers/sb-logout.controller.ts`   | public procedure (must work with an expired or unflagged session) |
| `services/sb-login.service.ts`          | `signInWithPassword`, tagged errors                               |
| `services/sb-logout.service.ts`         | `signOut`                                                         |
| `services/get-session.service.ts`       | `getUser()` once per request via React `cache()`                  |
| `services/get-cached-claims.service.ts` | `getClaims()` for rendering UI without a network call             |

Copied from BrewStock, minus the OTP services and the OAuth callback route. `protectedProcedure`
in `src/_bff/trpc/server.ts` is identical: it runs `getSession()`, returns 401 without a user and
500 on infrastructure failure.

## Authorization

- Every protected tRPC procedure uses `protectedProcedure` and filters by `ctx.user.id`.
- RLS is the second layer: even a repository bug cannot read another user's rows (see
  [database.md](database.md)).
- Strava tokens are never returned to the client. Only the connection status is exposed.
- Webhook and OAuth callback routes use the service-role client and verify their own inputs
  (see [strava.md](strava.md)).

## Content Security Policy

Already implemented in `src/lib/set-csp.ts`: `default-src 'self'`, `frame-ancestors 'none'`,
`object-src 'none'`, `upgrade-insecure-requests`, `'unsafe-eval'` in development only.

Additions expected over time: the Strava image host in `img-src` (profile photos, if shown). All
Strava and Anthropic calls are server-side, so `connect-src` stays `'self'`.

## Security headers

Add the same static headers BrewStock sets in `next.config.ts` `headers()`: `X-Content-Type-Options`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security`,
`X-Xss-Protection: 0`, `Permissions-Policy` with camera, microphone, geolocation and
browsing-topics denied.

## Secrets

- All secrets in env vars (see [architecture.md](architecture.md)), validated at startup by
  `@t3-oss/env-nextjs`.
- Strava `access_token` and `refresh_token` sit in `strava_connections`, behind RLS with no
  policies. They are never logged. Error objects stored in `strava_webhook_events.error` must not
  contain tokens.
- The webhook verify token and Strava client secret are compared with constant-time equality where
  they are checked.
