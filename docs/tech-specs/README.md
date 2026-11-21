# Roxcoach Specs

Roxcoach is a personal training assistant for Hyrox and running. It takes workouts from manual
upload, manual logging and manual Lyfta sync, and has an AI coach: a chat on the dashboard
(Google Gemini) that answers from the profile, the weekly availability, the races and the recent
activities. There is no weekly report and no stored plan.

This folder is the source of truth for what gets built. One file per module. Read the module spec
before touching its code, and update it in the same change.

## Module index

| Spec                                               | Covers                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)                 | `_bff` layering, module map, tRPC, Effect, env, code placement                                                         |
| [database.md](database.md)                         | Supabase schema, enums, RLS, migrations                                                                                |
| [auth-security.md](auth-security.md)               | Login page, Supabase session, proxy, CSP, key usage                                                                    |
| [signup-access-code.md](signup-access-code.md)     | `/signup` page: shared access code, automatic access grant with `roxcoach.grant_access`                                |
| [athlete-races.md](athlete-races.md)               | Starting point (profile, weekly availability) and races with goals                                                     |
| [manual-logging.md](manual-logging.md)             | Station times, loads and strength sets entered by hand                                                                 |
| [manual-upload.md](manual-upload.md)               | FIT, TCX and GPX upload from the dashboard, parsing, file storage                                                      |
| [lyfta.md](lyfta.md)                               | Manual Lyfta workout sync, credentials, import and storage                                                             |
| [zepp.md](zepp.md)                                 | Manual Zepp (Amazfit) run sync, token handling, adapter and import                                                     |
| [coach-chat.md](coach-chat.md)                     | Dashboard chat with the AI coach: context, tools, route, storage                                                       |
| [coach-model-fallback.md](coach-model-fallback.md) | Ordered list of Gemini models, automatic retry on the next one when a model is rate limited, model caption in the chat |
| [dashboard-progress.md](dashboard-progress.md)     | Running and Strength dashboard modes, progress charts, HR zones from per-run histograms (implemented)                  |
| [ux-design.md](ux-design.md)                       | Design system (from BrewStock), screens, calendar, states                                                              |

## Decisions log

| Decision       | Choice                                                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users          | One athlete today, created by hand in Supabase or through the access-code `/signup` page (no password reset). The schema and queries are multi-user from day one: `user_id` on every table, composite foreign keys, explicit `userId` in every query |
| Login          | Email and password only, one `/login` page, same Supabase implementation as BrewStock. New users join on `/signup` with a shared access code (closed unless `NEXT_SIGNUP_ACCESS_CODE` is set)                                                        |
| Coach          | A chat on the dashboard, grounded in the athlete's data (context block plus read-only tools), with saved conversations. Inside the app (AI SDK + Gemini free tier, behind a provider interface), not MCP                                             |
| Feedback       | Only when the athlete asks in the chat. No automatic or per-workout feedback                                                                                                                                                                         |
| Data sources   | Manual upload and manual logging, plus read-only manual Lyfta workout sync and Zepp run sync. No Strava sync, Garmin or Hevy                                                                                                                         |
| Language       | UI copy and coach output in English. Code in English                                                                                                                                                                                                 |
| Races          | One or many. Each has its own goal (target time). Hyrox and running races supported                                                                                                                                                                  |
| Design         | Exactly BrewStock's design system (tokens, fonts, shadcn base-ui components)                                                                                                                                                                         |
| Supabase       | Existing project shared with another app (free plan limit), own schema `roxcoach`, access flag `app_metadata.roxcoach`. Region is France                                                                                                             |
| Backend layout | Same `_bff` structure as BrewStock                                                                                                                                                                                                                   |

## Out of scope for v1

- Invite flow, per-user codes, email verification, password reset, OTP, OAuth login
- Billing, public pages, SEO (the data model already supports more users)
- MCP server (the coach is the in-app chat)
- A weekly report, a stored plan and any scheduled job
- Automatic or background Lyfta sync
- Push notifications
- Garmin, Apple Health, Hevy integrations
- Rate limiting beyond what Supabase Auth already enforces and the chat's daily message cap

## Open questions

1. Hyrox station loads per division. Store them in one constants file and verify against the
   official HYROX rules for the division you race in before first use.
2. Manual upload: see [manual-upload.md](manual-upload.md) for the open questions.
3. Coach chat: see [coach-chat.md](coach-chat.md) (Gemini free tier in the athlete's region, model id).

## Suggested build order

1. `architecture` and `database` (project skeleton, migrations, env)
2. `auth-security` (login, proxy, protected layout)
3. `athlete-races` (profile, availability, races CRUD)
4. `manual-upload` (FIT, TCX and GPX upload, storage)
5. `ux-design` calendar and activity detail on top of real data
6. `manual-logging`
7. `coach-chat` (migration `0009`, the `coach` module, the dashboard panel)
8. `lyfta` (migrations `0010` through `0013`, manual read-only workout sync; no background job)

## Implementation plans

| Plan                                                | Covers                                                        |
| --------------------------------------------------- | ------------------------------------------------------------- |
| [2026-11-20-lyfta.md](../plans/2026-11-20-lyfta.md) | Lyfta API, encrypted credentials, manual sync and Settings UI |
