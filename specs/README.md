# Roxcoach Specs

Roxcoach is a personal training assistant for Hyrox and running. It syncs workouts from Strava,
lets the athlete log what Strava cannot capture, and uses an AI coach that writes a weekly report every Sunday night
and proposes the next week toward each upcoming race.

This folder is the source of truth for what gets built. One file per module. Read the module spec
before touching its code, and update it in the same change.

## Module index

| Spec                                   | Covers                                                               |
| -------------------------------------- | -------------------------------------------------------------------- |
| [architecture.md](architecture.md)     | `_bff` layering, module map, tRPC, Effect, env, jobs, code placement |
| [database.md](database.md)             | Supabase schema, enums, RLS, migrations                              |
| [auth-security.md](auth-security.md)   | Login page, Supabase session, proxy, CSP, key usage                  |
| [athlete-races.md](athlete-races.md)   | Starting point (profile, weekly availability) and races with goals   |
| [strava.md](strava.md)                 | OAuth, token refresh, webhook, sync pipeline, activity mapping       |
| [manual-logging.md](manual-logging.md) | Station times, loads and strength sets entered by hand               |
| [coach.md](coach.md)                   | Sunday weekly report, 3-report memory, context, prompt, output       |
| [plan.md](plan.md)                     | Rolling week from the report, periodization rules, matching          |
| [ux-design.md](ux-design.md)           | Design system (from BrewStock), screens, calendar, states            |

## Decisions log

| Decision       | Choice                                                                                                                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users          | One athlete today, created by hand in Supabase (no sign-up, no password reset). The schema and queries are multi-user from day one: `user_id` on every table, composite foreign keys, explicit `userId` in every query |
| Login          | Email and password only, one `/login` page, same Supabase implementation as BrewStock                                                                                                                                  |
| Coach          | Weekly report every Sunday 20:00 Lisbon time, remembers the previous 3 reports. Inside the app (AI SDK + Anthropic), not MCP                                                                                           |
| Feedback       | Only in the weekly report. No per-workout feedback                                                                                                                                                                     |
| Data sources   | Strava plus manual logging. No Garmin or Hevy in v1                                                                                                                                                                    |
| Sync           | Strava webhook, processed by a Trigger.dev job. A manual "Sync now" button exists as a fallback                                                                                                                        |
| Language       | UI copy and coach output in English. Code in English                                                                                                                                                                   |
| Races          | One or many. Each has its own goal (target time). Hyrox and running races supported                                                                                                                                    |
| Plan           | The report proposes next week's sessions from the races and the weekly availability, with a per-race outlook                                                                                                           |
| Design         | Exactly BrewStock's design system (tokens, fonts, shadcn base-ui components)                                                                                                                                           |
| Supabase       | Existing project shared with another app (free plan limit), own schema `roxcoach`, access flag `app_metadata.roxcoach`. Region is France; `pg_cron` still runs in UTC                                                  |
| Backend layout | Same `_bff` structure as BrewStock                                                                                                                                                                                     |

## Out of scope for v1

- Registration, invite flow, password reset, OTP, OAuth login
- A second athlete's sign-up and invitation flow, billing, public pages, SEO (the data model already supports more users)
- MCP server and chat with the coach (a later module)
- Push notifications
- Garmin, Apple Health, Hevy integrations
- Rate limiting beyond what Supabase Auth and the Strava API already enforce

## Open questions

1. Hyrox station loads per division. Store them in one constants file and verify against the
   official HYROX rules for the division you race in before first use.
2. Strava API Agreement: confirm the current terms on AI use for a private, single-athlete app
   before launch (see [strava.md](strava.md), compliance note).
3. Trigger.dev project: reuse the BrewStock organization with a new project, or a new account.

## Suggested build order

1. `architecture` and `database` (project skeleton, migrations, env)
2. `auth-security` (login, proxy, protected layout)
3. `athlete-races` (profile, availability, races CRUD)
4. `strava` (OAuth, webhook, sync, activities)
5. `ux-design` calendar and activity detail on top of real data
6. `manual-logging`
7. `coach` weekly report and memory, then `plan` matching
