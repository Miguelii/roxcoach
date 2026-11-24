# Performance audit (2026-11-24)

Read-only audit of the whole app, done by three parallel reviewers (backend Effect services, database
and queries, Next.js frontend) and then cross-checked. Nothing was changed. Findings marked
**[checked]** were re-read in the code while consolidating; the rest were verified by the reviewer
that reported them. Latency numbers are estimates worked out from the code paths, not measurements.

One round trip (RT) from a Vercel function to Supabase costs roughly 15 to 30 ms in the same region
and 100 ms or more across continents. Every "N sequential RTs" below is multiplied by that.

## 0. Check first (settings outside the repo)

| ID  | What                                                                                                                                                                                                         | Why it matters                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Vercel function region vs Supabase region.** There is no `vercel.json` and no region pin, so functions run in the Vercel project default (`iad1` unless changed). Check the Trigger.dev worker region too. | If the functions are far from the database, every sequential RT in this report costs about 90 ms more. Pinning the region next to the database is the single biggest lever and needs no code. |
| C2  | **PostgREST "Max rows"** (Supabase dashboard, API settings, shared with the other app; hosted default 1000).                                                                                                 | Responses above it are cut without an error. P0-1 depends on it. Do not raise it for Roxcoach's sake, fix the queries instead.                                                                |

## Summary

| ID    | Area          | Finding                                                                                       | Gain                                              | Effort |
| ----- | ------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------ |
| P0-1  | DB / training | Strength sets and Zepp lap lookups silently truncated at Max rows                             | Correct stats, Zepp stops re-downloading details  | M      |
| P0-2  | tRPC / auth   | Every procedure in a batch calls Supabase Auth `getUser()`                                    | N to 1 Auth calls per request                     | S      |
| P1-1  | Coach         | 7 to 8 sequential RTs before the model starts, profile read 3 times                           | 3 to 4 RTs off time to first token                | M      |
| P1-2  | Lyfta sync    | 4 RTs per workout (about 400 per page), sets replaced non-atomically                          | About 100x fewer RTs per page                     | M      |
| P1-3  | DB / RLS      | 46 policies evaluate `auth.uid()` and `has_access()` per row                                  | Per-row overhead removed on big reads             | S      |
| P1-4  | Frontend      | `(app)` layout puts the whole UI behind `Suspense fallback={null}`: empty static shell        | App frame paints from the CDN on hard loads       | M      |
| P1-5  | Frontend      | Coach panel and react-markdown in the first-load JS of every page                             | About 35 to 45 KB gzip less per page              | S      |
| P2-1  | Dashboard     | Profile read 3 times, fallback double-mounts queries, week strip waits for the slowest query  | 1 RT on first paint, 3 to 6 fewer calls per visit | M      |
| P2-2  | Dashboard     | Strength progress: 3 sequential stages                                                        | 2 RTs                                             | S      |
| P2-3  | Activity page | Comparison loads every set of the last 150 workouts                                           | 60 to 90% fewer rows, 1 RT                        | S      |
| P2-4  | Dashboard     | Run progress reads `pace_histogram` for 12 months, uses 28 days                               | Hundreds of KB of jsonb per load                  | S      |
| P2-5  | DB            | No index on `activities (user_id, started_at)`                                                | O(history) to O(log n) on 3 queries               | S      |
| P2-6  | Frontend      | React Query defaults: `staleTime` 0, 3 retries on 4xx                                         | 2 to 4 calls per page switch, errors 6 s sooner   | S      |
| P2-7  | Frontend      | `getTimezone` duplicates `getProfile`, calendar has a client waterfall                        | 1 client RT on calendar                           | S      |
| P2-8  | Settings      | All 4 tabs mount and fetch at once                                                            | 3 fewer queries on entry                          | S      |
| P2-9  | Upload        | Independent checks run in series, laps deleted on a brand-new activity                        | About 8 to 4 RTs per upload                       | S      |
| P2-10 | Zepp sync     | 4 RTs per run, throttle sleep does not overlap the import                                     | Import hidden inside the 500 ms gap               | S      |
| P2-11 | Coach         | No time-to-first-event timeout in the model fallback                                          | Worst case 60 s to about 15 s                     | S      |
| P2-12 | Coach tools   | Races query thrown away, JS filtering, about 6k tokens re-sent per step                       | 1 query per call, 50 to 70% fewer tool tokens     | S      |
| P2-13 | Frontend      | vaul pulls in Radix Dialog (breaks the "never Radix" rule), install drawer in the root bundle | About 15 to 20 KB gzip off the root chunk         | M      |
| P2-14 | Frontend      | `/login` has no form in its static shell                                                      | Login LCP from the CDN                            | S      |
| P2-15 | DB            | Unindexed FKs: `coach_messages.user_id`, `public.logs.user_id`                                | No seq scan on every `auth.users` delete          | S      |
| P2-16 | Logs page     | `select('*')` with metadata x 1000 rows into RSC, 1000 DOM rows, recharts eager               | Smaller payload, faster render (admin only)       | S      |
| P3-x  | Various       | 28 low items (section P3)                                                                     | Small, mostly cleanup                             | S      |

Effort: S is under half a day, M is about a day.

---

## P0: correctness and biggest wins

### P0-1. Strength sets and Zepp lap lookups are silently truncated at Max rows [checked]

- **Where**
    - `src/_bff/modules/training/repositories/strength-sets.repository.ts:160-205` (`selectSetsForActivities`, `ID_CHUNK_SIZE = 100`)
    - Callers: `get-strength-progress.service.ts:45-50` and `get-activity.service.ts:44-65`
    - `src/_bff/modules/training/repositories/activity-laps.repository.ts:135-146` (`selectActivityIdsWithLaps`), called from `sync-zepp-activities.service.ts:127`
- **What happens**
    - The chunk counts **workouts**, not rows. At about 18 sets per workout (Lyfta mock), a chunk of 100 workouts returns about 1800 rows, so PostgREST returns 1000 arbitrary ones (there is no `order`).
    - The strength dashboard (12 months is about 200 workouts) and the activity page comparison (150 workouts) compute volume, top sets and "best ever" from roughly half the sets, and the subset changes between requests.
    - `selectActivityIdsWithLaps` returns one row **per lap** for every known Zepp run in 360 days (200 runs x 10 laps is 2000 rows). Runs past row 1000 look lapless, so every sync refetches their Zepp detail and rewrites their laps, burns the `MAX_DETAILS_PER_SYNC` budget, and `remaining` never reaches 0. The `in()` list is not chunked either (300 UUIDs is about 11 KB of URL).
- **Fix**
    - Sets: query `activities` with the sets embedded. Max rows applies to top-level rows only, so 150 to 200 parent rows stay far under it. `selectBackfillTargets` already uses an embed.
        ```ts
        supabase
            .from('activities')
            .select(
                'id, started_at, local_date, strength_sets(exercise, source_exercise_id, reps, load_kg)'
            )
            .eq('user_id', userId)
            .eq('strength_sets.user_id', userId)
            .eq('category', 'strength')
            .is('deleted_at', null)
            .gte('local_date', from)
            .lte('local_date', to)
            .order('started_at', { ascending: true })
        ```
        This also merges P2-2 (one stage instead of two). Stopgap if the chunks stay: page each chunk with `.order('id').range(...)` until a short page comes back.
    - Laps: an anti-join that returns only lapless runs, one row each:
        ```ts
        supabase
            .from('activities')
            .select('id, source_id, activity_laps(lap_index)')
            .eq('user_id', userId)
            .eq('source', 'zepp')
            .in('source_id', trackIds) // chunked at about 200
            .is('activity_laps', null)
        ```
- **Specs:** `dashboard-progress.md`, `zepp.md`.

### P0-2. Every procedure in a tRPC batch makes its own `getUser()` call [checked]

- **Where:** `src/_bff/trpc/server.ts:22-23`, `src/_bff/modules/auth/services/get-session.service.ts:28,38`, `src/_bff/trpc/context.ts:7`
- **What happens**
    - `resolveUser` is wrapped in React `cache()`, but `cache()` only dedupes inside an RSC render. In the react-server build it falls through when there is no dispatcher (`node_modules/next/dist/compiled/react/cjs/react.react-server.production.js:311`: `if (!dispatcher) return fn.apply(null, arguments)`), and the Next docs confirm memoization does not apply to Route Handlers.
    - `/api/trpc` is a Route Handler. `httpBatchLink` sends N procedures in one request, tRPC runs them concurrently, and each passes `isAuthed`: N `createDBServerClient()` and **N parallel Supabase Auth network calls**. Settings sends 4, dashboard and calendar 3. While a sync runs, status polling adds 2 every 5 s per tab.
    - Since the proxy matcher excludes `api/`, token refresh happens inside the tRPC route, so N parallel clients can race to refresh the same refresh token.
    - `docs/tech-specs/auth-security.md:171` says "once per request", which is only true for RSC.
- **Fix:** resolve the session once per HTTP request in the context (tRPC builds one context per request, the whole batch shares it). `getServerTrpc` builds the same context, and RSC keeps the `cache()` dedupe.
    ```ts
    // src/_bff/trpc/context.ts
    export const createContext = async () => {
        let session: Promise<SessionExit> | undefined
        return { session: () => (session ??= Effect.runPromiseExit(getSession())) }
    }

    // src/_bff/trpc/server.ts
    const isAuthed = t.middleware(async ({ ctx, next }) => {
        const session = await ctx.session()
        // unchanged from here
    })
    ```
    Optional, needs a spec decision: `getClaims()` (local JWT check, already used by the proxy) for read-only procedures on the publishable key, which RLS enforces anyway. Keep `getUser()` for mutations, `adminProcedure` and service-role work.
- **Gain:** N to 1 Auth calls per batch, lower tail latency on every client request, no refresh race.
- **Specs:** `auth-security.md`, `architecture.md` (tRPC context).

---

## P1: high

### P1-1. Coach chat: 7 to 8 sequential RTs before the model starts [checked]

- **Where:** `src/_bff/modules/coach/services/send-coach-message.service.ts:186-215`, `get-coach-context.service.ts:39-50`
- **What happens (in order):** `getUser` in the route, `findConversation`, `getTimezone` (profile read 1), `takeMessageSlot`, `createConversation` (new chats), `saveMessage`, `getAthleteTimezone` again (profile read 2), then a 4-way `Effect.all` whose `getProfile` is profile read 3 and whose `getCalendar` also runs a races query that is thrown away (upcoming races are already loaded), then `latestMessages`. About 8 Supabase clients per message. All of it adds to time to first token.
- **Fix:** read the profile once, then run every independent read in one step. The cap rule ("taken before anything is written") still holds because the parallel work is reads only.
    ```ts
    const [found, profile] =
        yield *
        Effect.all(
            [
                input.conversationId === null
                    ? Effect.succeed(null)
                    : ports.findConversation(user, input.conversationId),
                ports.getProfile(user),
            ],
            { concurrency: 'unbounded' }
        )
    // not-found check unchanged
    const timezone = validTimezoneOrUtc(profile.timezone)
    const today = todayIn(timezone, now)

    const [slotTaken, { context }, previous] =
        yield *
        Effect.all(
            [
                ports.takeMessageSlot(user, today, DAILY_MESSAGE_CAP),
                ports.getContext(user, { profile, timezone, today }),
                found === null
                    ? Effect.succeed([])
                    : ports.latestMessages(user, found.id, HISTORY_WINDOW - 1),
            ],
            { concurrency: 'unbounded' }
        )
    // cap check unchanged, then createConversation (if new) and saveMessage
    const messages = buildHistory([...previous, { role: 'user', content: input.message }])
    ```
    `getCoachContext` takes `{ profile, timezone, today }` instead of reading them, and uses a training service that returns activities only (see P2-12).
- **Gain:** 8 to 4 or 5 sequential RTs, 3 to 1 profile reads.
- **Spec:** `coach-chat.md`.

### P1-2. Lyfta import writes row by row [checked]

- **Where:** `src/_bff/modules/training/services/import-lyfta-workout.service.ts:30-58`, called per workout from `sync-lyfta-workouts.service.ts:109-121`
- **What happens:** per workout, 4 sequential RTs: an "existed?" select (only used to count `created`), the upsert, `deleteStrengthSets`, `insertStrengthSets`. A page of 100 workouts is about 400 RTs (6 to 12 s in region, 40 s or more across regions). Every resync deletes and reinserts every set. If the insert fails after the delete, the workout has no sets until the next run.
- **Fix:** write a whole page in 4 RTs, keeping one repository per table:
    1. `selectSourceIds(supabase, userId, 'lyfta', ids)` (exists) gives the created count.
    2. One bulk `upsert(rows, { onConflict: 'user_id,source,source_id', defaultToNull: false }).select('id, source_id')`. The existing `seenSourceIds` guard keeps the bulk upsert from hitting "cannot affect row a second time".
    3. One `delete().eq('user_id', userId).in('activity_id', pageIds)` (at most 100 ids).
    4. One `insert(allSetsOfPage)`.

    Option: an atomic `roxcoach.replace_strength_sets(p_user_id, p_activity_ids, p_sets jsonb)` RPC, service role only (`security invoker`, `search_path = ''`). Option: prefetch page N+1 with `Effect.forkChild` while page N is written.

- **Gain:** about 100x fewer DB RTs per page. A first sync goes from minutes to seconds and is less likely to hit `maxDuration`.
- **Spec:** `lyfta.md`.

### P1-3. RLS policies evaluate `auth.uid()` and `has_access()` per row [checked]

- **Where:** `db/migrations/0006_rls.sql:66-154`, `0008_activity_files.sql:33-41` (plus 3 `storage.objects` policies at 51-68), `0009_coach_chat.sql:50-69`, `0014_coach_usage.sql:18-24`. 46 policies, all shaped `using (user_id = auth.uid() and roxcoach.has_access())`.
- **Why it is slow:** without a subselect neither call becomes an InitPlan. `has_access()` cannot be inlined because it sets `search_path`, so every scanned row pays a function call and `auth.jwt()` parsing the claims to jsonb. This is Supabase's `auth_rls_initplan` advisor lint. Hot paths: strength progress and comparison (thousands of `strength_sets` rows), run progress, calendar.
- **Fix:** `alter policy` every one so both calls are evaluated once per statement. Same security meaning, `user_id` indexes stay usable.
    ```sql
    alter policy select_own on roxcoach.activities
        using (user_id = (select auth.uid()) and (select roxcoach.has_access()));
    ```
    Full migration in the appendix. `db/tests/rls.test.ts:28` (`OWNER_CHECK`) must change to the new deparsed text.
- **Gain (estimate):** about 10 to 30 microseconds per row, so 30 to 150 ms on the multi-thousand-row strength reads. Confirm with `EXPLAIN (ANALYZE)` as `authenticated` in a rolled-back transaction.
- **Specs:** `database.md`, `db/README.md`.

### P1-4. The `(app)` layout leaves the static shell empty [checked]

- **Where:** `src/app/(app)/layout.tsx:18-37`. `CoachSession` awaits `connection()`, `cookies()` and `getCachedClaims()`, and the whole app (sidebar, top bar, mobile nav, page headings and page fallbacks) sits inside `<Suspense fallback={null}>`.
- **Why it is slow:** on a hard load, a PWA cold start, a refresh or the login to dashboard navigation, nothing paints until a function renders `CoachSession` (possibly after a cold start). Only two bits are request data: `isAdmin` (the Logs link) and the `coach_enabled` cookie. `usePathname()` in `AppShell` and `MobileNav` is the second blocker on `/activities/[id]`.
- **Fix:** render `AppShell` in the static shell and isolate the request pieces in small holes.
    ```tsx
    export default function AppLayout({ children }: LayoutProps<'/'>) {
        return (
            <CoachPanelProvider enabled={readCoachEnabled()}>
                <AppShell
                    adminNav={
                        <Suspense fallback={null}>
                            <AdminNav />
                        </Suspense>
                    }
                >
                    {children}
                </AppShell>
                <Suspense fallback={null}>
                    <CoachChat />
                </Suspense>
            </CoachPanelProvider>
        )
    }
    ```
    The provider takes `enabled: Promise<boolean>` and only the coach toggle and launcher call `use(enabled)` inside their own `Suspense`. Wrap the active-state part of the nav in a `Suspense` whose fallback draws the same links with no active item. Check with the `next dev` instant navigation insights.
- **Gain:** the app frame and page skeletons paint at static-shell TTFB instead of dynamic TTFB (typically 150 to 600 ms earlier, more on a cold start). Soft navigations are unchanged.
- **Spec:** `ux-design.md`.

### P1-5. The coach panel ships in the first-load JS of every authenticated page [checked]

- **Where:** `src/app/(app)/layout.tsx:25` mounts `CoachChat`, which statically imports `coach-chat-view.tsx`, which imports `coach-message.tsx:2` (`react-markdown`). No `next/dynamic` anywhere in the coach module.
- **Why it is slow:** the panel renders nothing until opened, but react-markdown and its unified, micromark and mdast stack plus the composer and history menu are parsed and hydrated on every page, on phones too.
- **Fix:** keep the launcher and state eager, lazy-load the panel body, and preload on intent (`onPointerEnter` / `onFocus` on the launcher, `onPointerDown` on the mobile coach button, or on idle).
    ```tsx
    const CoachPanelBody = dynamic(
        () => import('@/modules/coach/coach-panel-body').then((module) => module.CoachPanelBody),
        { ssr: false, loading: () => <CoachPanelSkeleton /> }
    )
    ```
- **Gain:** roughly 35 to 45 KB min+gzip less JS per authenticated page, less hydration work (TBT, INP).

---

## P2: medium

### P2-1. Dashboard: repeated profile reads and double-mounted queries [checked in part]

- **Server:** `dashboard/page.tsx:39` reads the profile, then `get-run-progress.service.ts:54` reads the timezone (profile read 2), then `:58` reads the profile again (read 3). The critical path is profile, then timezone, then runs, profile and races: 3 sequential RTs. Fix: in `getRunProgress` use one `getProfile` and take `profile.timezone`, or let the caller pass `today`. Best case is one stage: query runs over a window widened by a day on each side in parallel with profile and races, then trim by the local date (every timezone is within one day of UTC).
- **Client:**
    - The Suspense fallback is a live `<DashboardContent />`, so on a soft navigation its hooks mount, then the streamed content replaces it and they mount again. Lyfta and Zepp status (`staleTime` 0) are fetched twice per visit. When the cache is older than 30 s the fallback and the server prefetch both fetch profile, calendar and progress.
    - The sidebar `DashboardModeToggle` (`app-shell.tsx:159`) fetches `getProfile` on every page before the `HydrationBoundary` hydrates.
    - `Promise.all` makes the week strip wait for the slowest query (12 months of runs with histograms). The header does not need the profile but sits inside the boundary.
- **Fix:** move the header and `ActivityActions` out of the boundary, make the fallback cache-only (`enabled: !cacheOnly`), and stream the dependent queries: start them without awaiting and dehydrate pending queries (TanStack 5.108 supports it).
    ```tsx
    const includePending = (query: Query) =>
        defaultShouldDehydrateQuery(query) || query.state.status === 'pending'
    // void queryClient.query(...) for calendar and progress, then
    <HydrationBoundary state={dehydrate(queryClient, { shouldDehydrateQuery: includePending })}>
    ```
- **Gain:** 1 RT on first paint, 3 to 6 fewer procedure calls per visit, week strip no longer waits for progress.

### P2-2. Strength progress runs 3 sequential stages [checked]

- **Where:** `get-strength-progress.service.ts:41-50`: timezone, then workouts, then sets in chunks.
- **Fix:** the embedded select from P0-1 plus the profile or widened-window trick from P2-1 gives one stage.
- **Gain:** 2 RTs, and the truncation risk goes away.

### P2-3. Activity page comparison over-fetches

- **Where:** `get-activity.service.ts:44-65`. It loads up to `STRENGTH_COMPARISON_HISTORY = 150` earlier workouts, then every set of all of them (about 2700 rows, subject to P0-1), while `buildStrengthComparison` only keeps the 4 to 8 exercises of the current workout. 2 more sequential RTs after the first parallel stage.
- **Fix:** when every current set has a `source_exercise_id`, add `.in('source_exercise_id', currentIds)`. The partial index `strength_sets_user_id_source_exercise_id_idx` (0011:11-13) exists and is unused today. Drop `exercise_image_url` where it is not rendered.
- **Also:** the coach `getActivity` tool (`coach/tools/get-activity.tool.ts:16`) calls the same service and discards `strengthComparisons`, so each tool call on a strength workout pays this cost inside the model loop. Add `{ withComparisons: false }` for the tool.
- **Gain:** 60 to 90% fewer rows and 1 RT on the page, 2 RTs per coach tool call.

### P2-4. Run progress reads `pace_histogram` for the whole range [checked]

- **Where:** `activities.repository.ts:366-372` selects `hr_histogram` and `pace_histogram` for every run in up to 12 months. `pace_histogram` is only used by `build-race-readiness.helper.ts:104-105` for the last 28 days.
- **Fix:** drop `pace_histogram` from the range query and add a second query in parallel, only when there is a next race, for `local_date >= today - 27`.
- **Gain:** about 85 to 90% of the pace jsonb (an estimated 150 to 350 KB per dashboard load) is no longer read, decompressed or zod-parsed.

### P2-5. No index on `activities (user_id, started_at)` [checked]

- **Where:** only `(user_id, local_date)` and the unique `(user_id, source, source_id)` exist (0004:29, 0010:17). These queries scan every activity of the user and sort:
    - `selectStrengthWorkoutsBefore` (`activities.repository.ts:408-424`), every strength activity page
    - `selectIdNearStartedAt` (`:592-613`), every upload and every imported Zepp run (up to 1000 per sync)
    - `selectStartedAtsBetween` (`:626-643`), the Zepp duplicate batch check
- **Fix:** `create index activities_user_id_started_at_idx on roxcoach.activities (user_id, started_at);` (a backward scan serves the `desc limit 150` query).
- **Gain:** small today, grows by 300 to 500 rows per user per year. Cheap to add in the same migration as P1-3.

### P2-6. React Query defaults [checked]

- **Where:** `src/providers/trpc-provider.tsx:12`: `new QueryClient()` with no defaults.
- **What happens:** only dashboard, calendar and races set a `staleTime`. Everything else (Lyfta and Zepp status, `getTimezone`, `getProfile` in `ProfileTab`, availability, coach lists) refetches on every mount and window focus, so switching apps in the installed PWA fires a burst. The same key with different `staleTime` (`getProfile` 0 in `ProfileTab`, 30 s elsewhere) always refetches. `retry: 3` with backoff retries 401, 403 and 404, so an expired session shows skeletons for about 7 s.
- **Fix:** a shared default in `src/lib/constants.ts`.
    ```tsx
    const retryServerErrors = (failureCount: number, error: unknown) =>
        failureCount < 2 &&
        !(error instanceof TRPCClientError && (error.data?.httpStatus ?? 500) < 500)

    new QueryClient({
        defaultOptions: { queries: { staleTime: QUERY_STALE_TIME_MS, retry: retryServerErrors } },
    })
    ```
    Sync polling is unaffected (`refetchInterval` while `running`).

### P2-7. `getTimezone` duplicates `getProfile`, and calendar has a client waterfall

- **Where:** `src/modules/calendar/calendar-page-content.tsx:13` queries `getTimezone`, and `calendar.tsx:45-50` only starts `getCalendar` after it resolves (no server prefetch). `races-view.tsx:14-31` queries `getTimezone`, `getProfile` and `races.list`.
- **Fix:** `useQuery(trpc.athlete.getProfile.queryOptions(undefined, { select: (profile) => profile.timezone }))`, the same for `hyroxDivision` in races. Prefetch `getProfile` once in the layout so the sidebar toggle hydrates too. Remove the `getTimezone` invalidation in `profile-tab.tsx:56` once unused.
- **Gain:** one client RT (150 to 300 ms on mobile) off the first calendar paint, one procedure less on races.

### P2-8. Settings mounts all four tabs at once [checked]

- **Where:** `src/modules/settings/settings-tabs.tsx:31-42` (`keepMounted` on every tab), `profile-tab.tsx:54-58` awaits three invalidations on submit.
- **Fix:** mount a tab the first time it is opened, then keep it mounted (a `visited` set). After a save, write the returned profile with `setQueryData` and do not await the invalidations.
- **Gain:** 3 fewer queries on entry (with `httpBatchLink` the batch waits for the slowest), save feels one RT faster.

### P2-9. Upload runs independent steps in series

- **Where:** `src/_bff/modules/training/services/upload-activity.service.ts:104-163`: the sha256 check, the nearby check and `getTimezone` in series; after `insertActivity`, `replaceLaps` (a delete on a brand-new id, then an insert) and `insertActivityFile` in series. `upload-handler.helper.ts:44-63` awaits `getUser()` before the free `content-length` check.
- **Fix:** `Effect.all` the three checks (`concurrency: 'unbounded'`); an `insertLaps` repository function with no delete for new activities, run in parallel with the file row and keeping the `onError` cleanup; check `content-length` first.
- **Gain:** about 8 to 4 or 5 sequential RTs per upload.

### P2-10. Zepp import: 4 RTs per run and a throttle that does not overlap

- **Where:** `src/_bff/modules/training/services/import-zepp-activity.service.ts:90-124`, `sync-zepp-activities.service.ts:139-177`
- **What happens:** per run, a 500 ms sleep, the detail fetch, then a nearby check (likely redundant with the batched `findZeppDuplicateTrackIds`, needs checking), the insert, the laps delete and the laps insert. `insertZeppActivity` detects duplicates through error 23505, which leaves a dead tuple and an error log line.
- **Fix:** run the import in parallel with the throttle sleep (`Effect.all([importActivity, sleep], { concurrency: 2 })`), use `insertLaps` for new runs, and `upsert(row, { onConflict: 'user_id,source,source_id', ignoreDuplicates: true }).select('id')` (empty result means duplicate).
- **Gain:** the import time disappears into the 500 ms gap. With `MAX_DETAILS_PER_SYNC` 1000 that is about 40 s of DB time in region.

### P2-11. The model fallback has no time-to-first-event timeout [checked]

- **Where:** `src/_bff/modules/coach/providers/fallback-coach-model.ts:34-42`. The 45 s deadline is only checked before switching models, and the Gemini provider only receives the request signal. The route has `maxDuration = 60`.
- **What happens:** if the first model hangs without emitting anything, the request dies at 60 s and the fallback never runs.
- **Fix:** give each model `AbortSignal.any([request.signal, controller.signal])` and a `FIRST_EVENT_TIMEOUT_MS` (for example 15 s, in coach constants) that aborts it, cleared on the first event. The existing catch path treats it as `unavailable` and falls back; a user cancel is still told apart through `request.signal.aborted`.
- **Gain:** worst case from a 60 s failure to about 15 s plus the next model.

### P2-12. Coach tools waste a query and tokens

- **Where:** `coach/tools/get-activities.tool.ts`, `get-weekly-summary.tool.ts`, `get-calendar.service.ts:54-60`
- **What happens:** `getCalendar` always runs `listRacesInRange` and the tools throw the races away. The category filter, sort and slice run in JS over up to 100 days. The tool returns up to 50 full `ActivityDTO`s (about 22 KB, about 6k tokens) that are re-sent on every step, up to `MAX_STEPS` 5.
- **Fix:** a training service `listActivities(user, { from, to, category, limit })` with `.eq('category', ...)`, `.order('local_date', { ascending: false })`, `.limit(MAX_ROWS + 1)` and no races query, used by the tools and by `getCoachContext`. Return a compact projection.
- **Gain:** 1 query per tool call and per context build, 50 to 70% fewer tool tokens, faster model steps.

### P2-13. vaul brings Radix Dialog, and the install drawer is in the root bundle [checked]

- **Where:** `src/components/ui/drawer.tsx:4` imports `vaul`, whose only dependency is `@radix-ui/react-dialog`. `src/app/layout.tsx:46` and `src/modules/pwa/install-prompt.tsx:4` statically import the install sheet (drawer and `next/image`) into the root chunk, `/login` included, though it only shows on a phone after 1.5 s.
- **Fix:** load `InstallPromptView` with `next/dynamic` and `ssr: false` now. Then migrate `drawer.tsx` (the only vaul importer) to `@base-ui/react/drawer`, which exists in the installed 1.9.0. This also brings the code in line with the "shadcn on base-ui, never Radix" rule.
- **Gain:** about 15 to 20 KB gzip off the root chunk, one overlay stack instead of two.

### P2-14. `/login` has no form in its static shell

- **Where:** `src/app/(auth)/login/page.tsx:14-30`: the whole card is in `<Suspense fallback={null}>` because it reads `searchParams` (only `returnTo` is needed).
- **Fix:** render the card statically, read `returnTo` from `window.location.search` at submit time, and keep only the "Create account" link (which reads `NEXT_SIGNUP_ACCESS_CODE`) in a small hole after `connection()`.
- **Gain:** login LCP at static TTFB.

### P2-15. Unindexed foreign keys

- **`coach_messages`** (`0009_coach_chat.sql:44-45`): only `(conversation_id, created_at)` exists. The FK to `auth.users on delete cascade` has no covering index, so every `auth.users` delete (the other app's included) seq-scans the table. It also breaks database.md rule 3 (every index starts with `user_id`). Replace it with `(user_id, conversation_id, created_at desc, id desc)`, which also serves the history query in exact order.
- **`public.logs.user_id`** (`0022_shared_logs_project.sql:12`, `on delete set null`): unindexed, so every `auth.users` delete seq-scans 30 days of both apps' logs. Add a partial index `where user_id is not null`. Build it by hand first with `create index concurrently` (the migration test forbids `concurrently` in migration files), so the migration statement is a no-op on the shared table.

### P2-16. Logs page payload and DOM

- **Where:** `src/_bff/modules/logs/repositories/logs.repository.ts:18-26` (`select('*')`), `src/app/(app)/logs/page.tsx:37-43`, `src/modules/logs/logs-table.tsx:15` (no windowing), `logs-histogram.tsx:3` (recharts static import).
- **What happens:** up to 1000 rows with `metadata` jsonb and `project` go into the RSC payload, though metadata is only read when one row is opened. Up to about 7k DOM nodes. Recharts in the route chunk.
- **Fix:** select the list columns only and load metadata by id on open (an admin procedure); `[content-visibility:auto]` on rows or pages of 200; `next/dynamic` for the histogram. The comment on the repository is stale (the page is admin-only now). Admin-only page, hence medium.

---

## P3: low

| ID    | Where                                                                               | What                                                                                                       | Fix                                                                                               |
| ----- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| P3-1  | `components/app-shell.tsx:129`, `mobile-nav.tsx:199`                                | `prefetch={true}` under `partialPrefetching` runs a function per link for pages that hit `connection()`    | Remove it (default `auto` prefetches the shared shell)                                            |
| P3-2  | `0004_training.sql:98`                                                              | `strength_sets (user_id, activity_id)` is a prefix of the 0012 index                                       | Drop it (cuts write cost on every resync)                                                         |
| P3-3  | `athlete/repositories/availability-slots.repository.ts:77-183`                      | Upsert, select, then up to 7 deletes, not atomic                                                           | `upsert().select('id')` then one `not in` delete, or an RPC                                       |
| P3-4  | `races/services/update-race.service.ts:28-32` (and complete, cancel, delete)        | `selectRaceById` then `getAthleteTimezone` in series                                                       | `Effect.all` both                                                                                 |
| P3-5  | `coach/services/get-conversation-messages.service.ts:18-25`                         | Conversation then messages in series                                                                       | `Effect.all`, both already filter by `user_id`                                                    |
| P3-6  | `send-coach-message.service.ts:110-131` (`saveReply`)                               | Insert then `touch` in series before `done`                                                                | Run both in parallel (keep before `done`)                                                         |
| P3-7  | `lyfta/services/start-lyfta-sync.service.ts:50-96` (Zepp the same)                  | Select, lease, trigger, `setRunId` before responding                                                       | Merge select and lease into one conditional update, move `setRunId` into `after()`                |
| P3-8  | `lyfta/services/lyfta-connection.service.ts:95-123`                                 | `/me`, then `/workouts?limit=1`, then the connection select                                                | Run them in parallel                                                                              |
| P3-9  | `lyfta-api.service.ts:35,48`, `zepp-api.service.ts:45`                              | Timeouts but no retry: one transient 5xx fails the whole task and Trigger reruns all of it                 | `Effect.retry` with jittered exponential backoff on transient errors only (never 401 or 429)      |
| P3-10 | `src/_bff/lib/server-logger.ts:60`                                                  | New supabase-js client per log line, metadata serialized twice                                             | Module-level lazy client, serialize once                                                          |
| P3-11 | `parse-fit.helper.ts:119-120`, `parse-tcx.helper.ts`, `parse-gpx.helper.ts:141-142` | Samples built twice (once per histogram), zod per trackpoint, sync XML parse                               | Build samples once, cheaper guards; move to a task if big files become common                     |
| P3-12 | `src/_bff/trpc/utils.ts:21`                                                         | Error path calls `getCachedClaims()`, another client (no `cache()` in route handlers)                      | Pass `ctx.user.id` from the controller                                                            |
| P3-13 | `src/styles/globals.css:8-10`                                                       | `scroll-behavior: smooth` animates every navigation in Next 16                                             | `data-scroll-behavior="smooth"` on `<html>`, gate on reduced motion                               |
| P3-14 | `calendar-chip.tsx:2,84`, `item-key.ts:1`, `day-panel.tsx:4`                        | effect `Match` in client code builds a matcher per chip                                                    | `switch` with a `never` check (update `ux-design.md`, which mandates `Match`)                     |
| P3-15 | `modules/lyfta/lyfta-ui.utils.ts:2`, `modules/zepp/zepp-ui.utils.ts:5`              | The whole `ErrorCode` enum (about 200 entries) ships to the client, from `_bff/lib`                        | Move the codes the UI maps into `src/_bff/core/constants`                                         |
| P3-16 | `src/app/layout.tsx:13-24`                                                          | Outfit gets a weight array (it is variable), Geist Mono preloaded on every page                            | Omit `weight`, `preload: false` on Geist Mono                                                     |
| P3-17 | `modules/coach/coach-panel-context.tsx:32-43`                                       | Context value changes with `open`, so `AppShell` re-renders on every open and close                        | Split state and stable actions contexts                                                           |
| P3-18 | `modules/coach/use-coach-chat.ts:213`, `coach-chat-view.tsx:233`                    | Every text delta re-renders the list and re-parses the growing markdown (quadratic) and writes `scrollTop` | Flush deltas once per animation frame, or plain text while streaming and markdown on `done`       |
| P3-19 | `components/mobile-nav.tsx:95`                                                      | `setDragX` on every `pointermove`                                                                          | Drive the transform through a ref, commit on release                                              |
| P3-20 | `login-card.tsx:53-54`, `app-shell.tsx:98-99`                                       | `router.replace` then `router.refresh` may render the destination twice                                    | Check in the network panel, keep only `replace` if enough                                         |
| P3-21 | `src/providers/trpc-provider.tsx:16`                                                | `httpBatchLink` waits for the slowest procedure                                                            | After P0-2, `splitLink` with `httpBatchStreamLink` for queries (not mutations: auth sets cookies) |
| P3-22 | `races-manager.tsx:37-50`, `use-dashboard-mode.ts:34-35`                            | Race mutations wait for a refetch, mode toggle refetches after an optimistic write                         | Optimistic updates with rollback, drop the redundant refetch                                      |
| P3-23 | Upload, race and log drawers                                                        | Interaction-only drawer bodies loaded eagerly                                                              | `next/dynamic` for the bodies, keep triggers static                                               |
| P3-24 | `activities.deleted_at`                                                             | Filtered everywhere, never written (deletes are hard)                                                      | Decide: implement soft delete (then partial indexes) or drop it                                   |
| P3-25 | Measurement columns                                                                 | `numeric` for distance, HR, speed, calories                                                                | Optional `double precision` / `smallint` (table rewrite)                                          |
| P3-26 | `coach_messages`, `coach_usage`                                                     | No retention; `public.logs` retention depends on the other app                                             | Decide a policy, document the dependency                                                          |
| P3-27 | Coach `HISTORY_WINDOW` 20                                                           | Long replies re-sent every turn and step                                                                   | Product decision: truncate or summarize older replies                                             |
| P3-28 | `training/services/backfill-histograms.service.ts`                                  | One target at a time (one-off CLI)                                                                         | `concurrency: 4` if run again                                                                     |

---

## Already done well (do not "fix")

- **Auth:** the proxy and layouts use `getClaims()` (local JWT check); `getCachedClaims()` and `getSession()` are deduped with `cache()` inside RSC.
- **Data loading:** dashboard server prefetch through the in-process tRPC proxy with matching keys and `HydrationBoundary`; failed prefetches left out; 30 s `staleTime` on dashboard queries; `keepPreviousData` on range changes; `loadActivity` shared by `generateMetadata` and the page.
- **Parallelism where obvious:** `getActivity` first stage, `getCalendar`, the 4-way `getCoachContext` batch, the `getRunProgress` second stage, chunked set reads with bounded concurrency.
- **Bundle:** every dashboard chart is `next/dynamic` with `ssr: false`; `ai`, `@ai-sdk/google`, `@garmin/fitsdk` and `fast-xml-parser` stay server-side; `AppRouter` is a type import; icon and `effect` barrels are covered by `optimizePackageImports`.
- **Background sync:** Trigger.dev tasks with a lease, idempotent upserts, per-window checkpoints, caps on pages and details, batched Zepp dedup, one admin client and one timezone read per sync.
- **External calls:** timeouts on every fetch, AI SDK `maxRetries: 0` with the app's own fallback chain and abort propagation.
- **Logging:** fire and forget through `after()` in requests.
- **Database:** explicit column lists almost everywhere, histograms excluded from `COLUMNS`, every `onConflict` matches a real unique key, no offset pagination, no `count: 'exact'`, right indexes on the main access paths, functions with a fixed `search_path` and correct volatility.
- **Invalidations** are targeted per procedure; sync polling only runs while `running`.
- **Cache Components:** no shared data is a real `use cache` candidate (everything is per user); the gap is the static shell (P1-4).

---

## Suggested order

1. **Check C1 and C2** (no code).
2. **Quick wins, one PR:** P0-2 (session in the tRPC context), P2-6 (query defaults), P2-11 (first-event timeout).
3. **Correctness:** P0-1 with P2-2 and P2-3 (embedded strength reads).
4. **Migration 0023:** P1-3, P2-5, P2-15, P3-2 (appendix).
5. **Coach latency:** P1-1, P2-12, the tool part of P2-3.
6. **Frontend shell and bundle:** P1-4, P1-5, P2-1, P2-7, P2-13, P2-14, P2-8.
7. **Sync throughput:** P1-2, P2-10, P3-9.
8. **The rest:** P2-4, P2-9, P2-16, then P3 as convenient.

Specs to update with the code (CLAUDE.md rule): `auth-security.md` and `architecture.md` (P0-2), `database.md` and `db/README.md` (migration), `coach-chat.md` (P1-1, P2-11, P2-12), `dashboard-progress.md` (P0-1, P2-1 to P2-4), `lyfta.md` (P1-2, P3-9), `zepp.md` (P0-1, P2-10), `ux-design.md` (P1-4, P3-14).

---

## Appendix: proposed migration `0023_query_performance.sql`

Follows `db/tests/migrations.test.ts`: `begin;` first, the record insert second to last, `commit;` last,
no `concurrently`. Run the logs index by hand first (see P2-15).

```sql
begin;

-- alter policy takes an access exclusive lock per table, storage.objects (shared) included.
set local lock_timeout = '5s';

create index activities_user_id_started_at_idx
    on roxcoach.activities (user_id, started_at);

create index coach_messages_user_id_conversation_id_created_at_idx
    on roxcoach.coach_messages (user_id, conversation_id, created_at desc, id desc);
drop index roxcoach.coach_messages_conversation_id_created_at_idx;

drop index roxcoach.strength_sets_user_id_activity_id_idx;

create index if not exists logs_user_id_idx
    on public.logs (user_id)
    where user_id is not null;

-- Repeat this block for athlete_profiles, availability_slots, races, activities, activity_laps,
-- station_results, strength_sets, activity_files, coach_conversations, coach_messages, and
-- coach_usage (no delete policy there).
alter policy select_own on roxcoach.activities
    using (user_id = (select auth.uid()) and (select roxcoach.has_access()));
alter policy insert_own on roxcoach.activities
    with check (user_id = (select auth.uid()) and (select roxcoach.has_access()));
alter policy update_own on roxcoach.activities
    using (user_id = (select auth.uid()) and (select roxcoach.has_access()))
    with check (user_id = (select auth.uid()) and (select roxcoach.has_access()));
alter policy delete_own on roxcoach.activities
    using (user_id = (select auth.uid()) and (select roxcoach.has_access()));

alter policy activity_files_select_own on storage.objects
    using (
        bucket_id = 'activity-files'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
        and (select roxcoach.has_access())
    );
alter policy activity_files_insert_own on storage.objects
    with check (
        bucket_id = 'activity-files'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
        and (select roxcoach.has_access())
    );
alter policy activity_files_delete_own on storage.objects
    using (
        bucket_id = 'activity-files'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
        and (select roxcoach.has_access())
    );

insert into roxcoach.schema_migrations (filename) values ('0023_query_performance.sql');
commit;
```

Run by hand first, alone, outside a transaction:

```sql
create index concurrently if not exists logs_user_id_idx on public.logs (user_id) where user_id is not null;
```

After applying: the Supabase advisor lints `auth_rls_initplan`, `unindexed_foreign_keys` and
`unused_index` should clear, and `pg_stat_user_indexes` should show scans on the new indexes.
