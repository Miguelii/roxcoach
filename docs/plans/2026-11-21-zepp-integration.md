# Zepp integration and Settings Integrations tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings "Integrations" tab with Lyfta and Zepp cards, where Zepp signs in once with email and password and a manual "Sync" imports outdoor runs from the Amazfit Bip 6 cloud as normal Roxcoach activities.

**Architecture:** New `src/_bff/modules/zepp` module mirroring `lyfta` (controllers, services, connection repository). Zepp's upstream model is parsed with zod, then a pure adapter turns it into the existing normalized activity (`ParsedActivity` minus `format`), which a training service stores with `source = 'zepp'` and the Zepp track id as `source_id`. No file is stored: charts read the histograms already kept on the activity row.

**Tech Stack:** Next.js (custom, see AGENTS.md), tRPC, Effect v4, Supabase (`roxcoach` schema), zod, react-hook-form, shadcn on base-ui, vitest via `pnpm test`.

**Spec:** `docs/superpowers/specs/2026-11-21-zepp-integration-design.md`. Real payloads: `mocks/zepp_history_mock.json`, `mocks/zepp_detail_mock.json`. This plan narrows the spec in three places, each also edited in the spec: only sport type `1` (outdoor run) is imported (types 6 and 214 have no mock yet), only `app_token` is stored (no `user_id`), and no GPS coordinates or laps are decoded (the normalized activity has no coordinates and GPX gives no laps either).

## Global Constraints

- All code, identifiers, comments, error tags, enum values and UI copy are in English. No em-dashes anywhere (code, comments, copy, docs, commits).
- `pnpm` only. Never run vitest directly: `pnpm test` (a file argument filters). Never start a dev server.
- Imports under `src/` always use the `@/` alias, never `./` or `../`.
- Types are declared at the top of the file. Props are a named `type Props`. Merge classes with `cn()`, semantic color tokens only.
- Comments only for non-obvious logic, never narrating names or markup.
- Controllers: thin tRPC binding, one constant per file named `<NAME>_PROTECTED_CONTROLLER`, `runEffect(...)` with an exhaustive `Match.tag` map. Services and repositories are `Effect.fn('name')` on Effect v4 (`Effect.catch`, `Effect.result`, `Effect.forkChild`), `return yield*` to fail, no try/catch inside `Effect.gen`. Repositories take `(supabase, userId, ...)`, filter by `user_id` and set it on inserts, and check both the `Effect.tryPromise` catch and the returned `error`.
- Errors are `Data.TaggedError` classes in `src/_bff/lib/errors.ts` with `cause: unknown` and `error_hash: ErrorCode`; codes in `src/_bff/lib/error-codes.ts`. Secrets, tokens and passwords never reach logs or error payloads.
- `_bff` never imports from `src/lib`, `src/modules`, `src/components`, `src/hooks` or `src/app`. Cross-module imports only through `services/`.
- Every Supabase client uses `db: { schema: 'roxcoach' }`; nothing in `public`.
- Tests: every element used carries a `data-testid` and is located by test id only; copy is checked with `toHaveText` or `toContainText`; no module mocks when a fake dependency can be passed in. The fake DB is `src/_bff/modules/training/repositories/__tests__/fake-db.ts`.
- Zepp payload shape is only what `mocks/zepp_*.json` shows. Never assume another field; if a real response shows something new, update the mock and `docs/tech-specs/zepp.md` in the same change.
- Do not commit or push unless the athlete asks. Each task ends with `pnpm fmt`, `pnpm check`, `pnpm knip`, `pnpm typecheck` and `pnpm test` green.

## Review Focus

- **Expired or rejected token:** a non-200 status or `code !== 1` from the list call must become `ZeppSessionExpiredError` (clear copy, nothing sensitive), never a generic crash. Owned by Task 5.
- **A run with no distance** (`dis` of `0.0`, the mock's Hyrox and strength rows are examples) must be skipped, not imported as an empty activity. Owned by Task 8.
- **Sentinel values** (`-1`, `-20000`, `-274.0`, `"0.0"` heart rate) must become `null`, never a number in a chart. Owned by Tasks 3 and 4.
- **Pressing Sync twice at once:** the unique `(user_id, source, source_id)` index must turn the second insert into "already imported", never a duplicate or an error toast. Owned by Task 7.
- **The same run already uploaded by hand from a Zepp file:** an activity of that user starting within 300 seconds must be skipped as a duplicate. Owned by Task 8.

---

### Task 1: Database migration

**Files:**

- Create: `db/migrations/0020_zepp.sql`
- Modify: `db/tests/schema.test.ts` (register the migration like `0019`), `docs/tech-specs/database.md`

**Interfaces:**

- Produces: enum value `'zepp'` on `roxcoach.activity_source`; table `roxcoach.zepp_connections (user_id uuid pk default auth.uid() references auth.users on delete cascade, encrypted_app_token text not null, last_synced_at timestamptz, created_at, updated_at)` with RLS enabled and all privileges revoked from `authenticated` and `anon` (service role only, exactly like `lyfta_connections` in `0010_lyfta.sql`), `set_updated_at` trigger, and the `schema_migrations` insert.

- [ ] **Step 1: Write the failing test.** In `db/tests/schema.test.ts` add `0020_zepp.sql` to the expected migration list and a test `zepp_connections is locked to the service role` asserting `authenticated` has no privilege on the table and that the enum contains `zepp`, following how `lyfta_connections` is asserted there.
- [ ] **Step 2: Run** `pnpm test db/tests/schema.test.ts`. Expected: FAIL (migration missing).
- [ ] **Step 3: Write `0020_zepp.sql`.** Adding an enum value cannot run inside the transaction, so reuse the exact rebuild pattern of `0010_lyfta.sql` (`activity_source_with_zepp`, column to text, drop, rename, back to enum) with values `('strava','manual','lyfta','zepp')`; the `(user_id, source, source_id)` unique index already exists and is reused.
- [ ] **Step 4: Run** the same test. Expected: PASS (these db tests are flaky under the full suite; rerun alone if needed).
- [ ] **Step 5: Document** the table, the new enum value and "Zepp activities have no `activity_files` row" in `docs/tech-specs/database.md`.

---

### Task 2: Secret encryption, env and error vocabulary

**Files:**

- Create: `src/_bff/lib/secret-crypto.ts`, `src/_bff/lib/__tests__/secret-crypto.test.ts`, `src/_bff/modules/zepp/utils/credentials.utils.ts`, `src/_bff/modules/zepp/utils/__tests__/credentials.utils.test.ts`
- Modify: `src/_bff/modules/lyfta/utils/credentials.utils.ts` (delegate to the generic functions, behavior and messages unchanged), `src/env/server.ts`, `src/_bff/lib/error-codes.ts`, `src/_bff/lib/errors.ts`, `docs/tech-specs/architecture.md` (env table), `.env.example` if it exists

**Interfaces:**

- Produces: `encryptSecret(plain: string, encodedKey: string, label: string): string` and `decryptSecret(payload: string, encodedKey: string, label: string): string` (AES-256-GCM, `v1.nonce.tag.ciphertext`, same format as Lyfta; `label` only appears in error messages). Zepp wrappers `encryptZeppToken(token, encodedKey)` and `decryptZeppToken(payload, encodedKey)`. Env `NEXT_ZEPP_ENCRYPTION_KEY`, optional at startup like Lyfta's, with a base64 32-byte validator.
- Error codes (enum `ErrorCode`): `ZEPP_CONFIGURATION='zepp001'`, `ZEPP_CREDENTIAL='zepp002'`, `ZEPP_CONNECTION_QUERY='zepp003'`, `ZEPP_CONNECTION_WRITE='zepp004'`, `ZEPP_CONNECTION_PARSE='zepp005'`, `ZEPP_API_REQUEST='zepp006'`, `ZEPP_API_RESPONSE='zepp007'`, `ZEPP_LOGIN_REJECTED='zepp008'`, `ZEPP_SESSION_EXPIRED='zepp009'`, `ZEPP_NO_CONNECTION='zepp010'`, `ZEPP_IMPORT='zepp011'`, `TRAINING_ZEPP_ACTIVITY_INSERT='zepp012'`, `TRAINING_ZEPP_ACTIVITY_INSERT_ERR='zepp013'`, `TRAINING_ZEPP_ACTIVITY_SELECT='zepp014'`, `TRAINING_ZEPP_ACTIVITY_SELECT_ERR='zepp015'`.
- Error classes in `errors.ts`, one per code above with the same `ZEPP` names: `ZeppConfigurationError`, `ZeppCredentialError`, `ZeppConnectionQueryError`, `ZeppConnectionWriteError`, `ZeppConnectionParseError`, `ZeppApiRequestError`, `ZeppApiResponseError`, `ZeppLoginRejectedError`, `ZeppSessionExpiredError`, `ZeppConnectionNotFoundError`, `ZeppImportError`. Existing `ActivityQueryError` and `ActivityWriteError` cover the training codes.

- [ ] **Step 1: Write failing tests.** `secret-crypto.test.ts`: round trip returns the plain text; two encryptions of the same text differ; a tampered payload throws `Invalid encrypted <label> credential`; an empty secret throws `<label> cannot be empty`; a key that is not 32 bytes of base64 throws `Invalid <label> encryption key`. `credentials.utils.test.ts` (Zepp): round trip through the wrappers. Run the existing Lyfta `credentials.utils.test.ts` unchanged as the regression guard.
- [ ] **Step 2: Run** `pnpm test src/_bff/lib src/_bff/modules/zepp/utils src/_bff/modules/lyfta/utils`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `secret-crypto.ts` by moving the body of the Lyfta credentials util, parameterizing only the messages with `label`, and make the Lyfta wrappers call it with label `'Lyfta'` so their messages stay byte-identical. Add the env variable, codes and classes.
- [ ] **Step 4: Run** the same tests plus `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Document** the variable in the `architecture.md` env table (and `.env.example` when present). The athlete must add a value to their own `.env.local` (generate with `openssl rand -base64 32`); the plan never writes a key.

---

### Task 3: Zepp upstream model and series decoders

**Files:**

- Create: `src/_bff/modules/zepp/types/index.ts`, `src/_bff/modules/zepp/utils/schemas.utils.ts`, `src/_bff/modules/zepp/utils/series.utils.ts`, tests under `src/_bff/modules/zepp/utils/__tests__/`
- Modify: `CLAUDE.md` (add a short "Zepp" section after "Lyfta": consult `mocks/zepp_*.json` before touching the integration or reading a new field, never invent fields, ask the user for a real sample, update the mock and `docs/tech-specs/zepp.md` together)

**Interfaces:**

- Produces in `types/index.ts`: `ZeppRunSummary = { trackId: string; source: string; sportType: number; distanceM: number; movingTimeS: number; endTimeS: number; avgHrBpm: number | null; maxHrBpm: number | null; calories: number | null; sportTitle: string | null }` and `ZeppRunDetail = { trackId: string; heartRate: string; distance: string; speed: string }` (the three raw strings the adapter needs).
- Produces in `schemas.utils.ts`: `parseZeppHistory(json: unknown): { summaries: ZeppRunSummary[]; next: number }` and `parseZeppDetail(json: unknown): ZeppRunDetail`; both throw a `ZodError` the service wraps. The summary schema accepts numbers or numeric strings (the mock mixes both: `"dis":"3119.12"`, `"type":1`) via coercion and reads only the fields above. Sentinels: `avg_heart_rate` and `max_heart_rate` of `0` or less, `calorie` of `0` or less, become `null`; empty `sport_title` becomes `null`.
- Produces in `series.utils.ts`: `type ZeppPoint = { offsetS: number; value: number }`, `decodeDeltaSeries(raw: string): ZeppPoint[]`, `decodeAbsoluteSeries(raw: string): ZeppPoint[]`.

Decoding rules (verified against `mocks/zepp_detail_mock.json`; entries are `;` separated, each `dt,value`, `dt` is seconds since the previous entry and the running sum of `dt` is the offset in seconds from the track id):

- `heart_rate`: `value` is delta coded, the first entry absolute (`142,99` then `1,-1` gives 99 then 98). `decodeDeltaSeries` returns the running sum. Mock check: 721 entries, mean 143, min 96, max 166.
- `currentDistance`: `value` is cumulative distance in centimetres (last value `311505`). `decodeAbsoluteSeries` returns it unchanged; the adapter divides by 100.
- `speed`: `value` is metres per second, absolute (`4.25532`).
- Blank or malformed entries are skipped, never thrown.

- [ ] **Step 1: Write failing tests** against the mocks: `parseZeppHistory(history)` returns 8 summaries and `next` of `-1`; the type 1 summary has `trackId '1794943080'`, `distanceM 3119.12`, `movingTimeS 722`, `endTimeS 1794944409`, `avgHrBpm 143`, `maxHrBpm 166`, `calories 85`, `sportTitle null`; the type 214 summary has `avgHrBpm` of `98`. `parseZeppDetail(detail)` keeps the three strings. `decodeDeltaSeries('142,99;1,-1;1,0')` equals offsets 142, 143, 144 with values 99, 98, 98. `decodeAbsoluteSeries('0,0;142,0;1,596')` has offsets 0, 142, 143. From the real detail: the heart rate series has 721 points whose last offset is `1329` (equals `endTimeS - trackId`).
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/zepp/utils`. Expected: FAIL.
- [ ] **Step 3: Implement** the schemas and decoders as specified. Tests import the mock JSON files from `mocks/`.
- [ ] **Step 4: Run** the same tests. Expected: PASS.

---

### Task 4: Zepp to Roxcoach adapter

**Files:**

- Create: `src/_bff/modules/zepp/utils/adapter.utils.ts`, `src/_bff/modules/zepp/utils/__tests__/adapter.utils.test.ts`

**Interfaces:**

- Consumes: `ZeppRunSummary`, `ZeppRunDetail`, the decoders of Task 3, `buildHrHistogram` and `buildPaceHistogram` from `src/_bff/modules/training/helpers/`, `HrSample` from `training/types/progress`.
- Produces: `type AdaptedActivity = Omit<ParsedActivity, 'format'>` (exported from `zepp/types`) and `adaptZeppRun(summary: ZeppRunSummary, detail: ZeppRunDetail): AdaptedActivity`. Cross-module imports of training helpers are the one allowed exception here: they are pure helpers shared by design; if `knip` or the architecture rule objects, move the call into the training import service (Task 7) and have the adapter return `samples: HrSample[]` instead. The builder decides and records it in `zepp.md`.

Mapping (spec values): `startedAt` = ISO of `trackId * 1000` (the mock gives `2026-11-17T19:18:00.000Z`; the series starts 142 s later because the watch counts a lead-in); `sportType 'running'`, `category 'run'`; `name` = `sportTitle ?? 'Run'`; `distanceM`, `movingTimeS` from the summary; `elapsedTimeS = endTimeS - trackId` (1329 for the mock, includes pauses); `elevationGainM null`; `avgHr`/`maxHr` from the summary; `avgSpeedMps = distanceM / movingTimeS`; `calories` from the summary; `noteText null`; `laps []`. Samples for the histograms: timeline is the `currentDistance` series; for each point `t = (trackId + offsetS) * 1000`, `distanceM = value / 100`, `hr` and `speedMps` taken from the latest heart rate and speed point with offset at or before it (`null` before the first), then `buildHrHistogram(samples)` and `buildPaceHistogram(samples)`.

- [ ] **Step 1: Write failing tests** with the mock run: `startedAt`, `distanceM` 3119.12, `movingTimeS` 722, `elapsedTimeS` 1329, `avgHr` 143, `maxHr` 166, `calories` 85, `category 'run'`, `name 'Run'`, `laps` empty, `elevationGainM` null; the sum of `hrHistogram.bins` distances is between 2900 and 3200 and its bpm bins lie within 96 to 166; `paceHistogram.bins` is non-empty with total time at most 722 s plus 5%. A summary with `avgHrBpm null` gives `avgHr null` and an empty `hrHistogram.bins` when the detail has no heart rate (`heartRate: ''`).
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/zepp/utils/__tests__/adapter.utils.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `adaptZeppRun` as mapped above.
- [ ] **Step 4: Run** the test. Expected: PASS.

---

### Task 5: Zepp API client

**Files:**

- Create: `src/_bff/modules/zepp/constants/index.ts`, `src/_bff/modules/zepp/services/zepp-api.service.ts`, `src/_bff/modules/zepp/services/__tests__/zepp-api.service.test.ts`

**Interfaces:**

- Consumes: parsers of Task 3, error classes of Task 2.
- Produces: `type ZeppDeps = { fetch: typeof fetch }`, `DEFAULT_ZEPP_DEPS`, and
    - `loginToZepp(email: string, password: string, deps?: ZeppDeps): Effect<string, ZeppLoginRejectedError | ZeppApiRequestError | ZeppApiResponseError>` returning the `app_token`.
    - `fetchZeppHistory(appToken: string, deps?): Effect<{ summaries: ZeppRunSummary[]; next: number }, ZeppSessionExpiredError | ZeppApiRequestError | ZeppApiResponseError>`
    - `fetchZeppDetail(appToken: string, summary: ZeppRunSummary, deps?): Effect<ZeppRunDetail, same errors>`

Port of the `huami-token` login (MIT, Kirill Snezhko; keep a one line comment crediting it next to the constants, because the key and IV are not ours): step 1 POSTs the form-encoded payload (`emailOrPhone`, `password`, `state=REDIRECTION`, `client_id=HuaMi`, `redirect_uri=https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html`, `region=us-west-2`, `token=access`, `token=refresh`, `country_code=US`) encrypted with `aes-128-cbc` (PKCS7), key `xeNtBVqzDc6tuNTh`, IV `MAAAYAAAAAAAAABg`, to `https://api-user-us2.zepp.com/v2/registrations/tokens` with `redirect: 'manual'` and the Android headers of `huami_token/constants.py` (`HEADERS.ZEPP_TOKENS`); success is HTTP 303 with a `Location` whose query has `access`. Step 2 POSTs form data (`code=<access>`, a random `device_id`, `device_model=android_phone`, `app_version=9.12.5`, `grant_type=access_token`, `allow_registration=false`, `third_name=huami`, `app_name=com.huami.midong`, `country_code=US`, `lang=en`, plus `dn` and `source` exactly as in `PAYLOADS.ZEPP_LOGIN`) to `https://api-mifit-us2.zepp.com/v2/client/login` with `HEADERS.ZEPP_LOGIN`; the answer's `token_info.app_token` is the result. A status other than 303 on step 1 is `ZeppLoginRejectedError` (the credentials were refused). History and detail use `https://api-mifit-us2.zepp.com/v1/sport/run/history.json` and `.../detail.json?trackid=<id>&source=<source>` with headers `apptoken`, `appPlatform: web`, `appname: com.huami.midong` (all three verified in the spike). Spacing between detail calls is the sync service's job.

- [ ] **Step 1: Write failing tests** with a fake `fetch` returning canned `Response`s: login happy path returns the token and the first request body is not the plain password (assert the body does not contain the password text and its length is a multiple of 16); step 1 returning 200 fails with `ZeppLoginRejectedError`; history returns summaries from `mocks/zepp_history_mock.json`; history with HTTP 401, with HTTP 200 and `{ code: 0 }`, and with a non-JSON body each fail with `ZeppSessionExpiredError`; a rejected `fetch` fails with `ZeppApiRequestError`; detail returns the strings from `mocks/zepp_detail_mock.json`; no error message or `cause` contains the password or token (assert with `JSON.stringify`).
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/zepp/services/__tests__/zepp-api.service.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three functions with `Effect.tryPromise` around `fetch`, mapping as above.
- [ ] **Step 4: Run** the test and `pnpm typecheck`. Expected: PASS.

---

### Task 6: Connection storage and status

**Files:**

- Create: `src/_bff/modules/zepp/types/connection.ts` (or extend `types/index.ts`), `src/_bff/modules/zepp/repositories/zepp-connections.repository.ts`, `src/_bff/modules/zepp/services/zepp-connection.service.ts`, tests in `repositories/__tests__` and `services/__tests__`

**Interfaces:**

- Consumes: Task 2 crypto and errors, Task 5 `loginToZepp`.
- Produces: repository `selectZeppConnection(supabase, userId): Effect<{ encryptedAppToken: string; lastSyncedAt: string | null } | null>`, `upsertZeppConnection(supabase, userId, encryptedAppToken)` (clears `last_synced_at`), `updateZeppLastSyncedAt(supabase, userId, iso)`, `deleteZeppConnection(supabase, userId)`, all with the admin client type used by `lyfta-connections.repository.ts`. Service `connectZepp(user, { email, password })` (logs in, encrypts the token with `NEXT_ZEPP_ENCRYPTION_KEY`, upserts, returns void; the password is never stored), `getZeppConnectionStatus(user): { connected: boolean; lastSyncedAt: string | null }`, `disconnectZepp(user)`, and `decryptZeppConnectionToken(record): Effect<string, ZeppCredentialError | ZeppConfigurationError>` for Task 8. Mirror the structure and dependency injection of `lyfta-connection.service.ts`.

- [ ] **Step 1: Write failing tests** with the fake DB and a fake `loginToZepp`: connect stores only ciphertext (the stored value differs from the token and from the password and decrypts back to the token); connecting again replaces it and nulls `last_synced_at`; status is `{ connected: false, lastSyncedAt: null }` with no row and reflects `last_synced_at` with one; disconnect deletes the row; a login rejection stores nothing; a missing `NEXT_ZEPP_ENCRYPTION_KEY` fails with `ZeppConfigurationError`.
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/zepp`. Expected: FAIL.
- [ ] **Step 3: Implement** repository and service.
- [ ] **Step 4: Run** the tests. Expected: PASS.

---

### Task 7: Storing an imported activity

**Files:**

- Create: `src/_bff/modules/training/services/import-context.service.ts`, `src/_bff/modules/training/services/import-zepp-activity.service.ts`, tests in `services/__tests__`
- Modify: `src/_bff/modules/training/services/import-lyfta-workout.service.ts` (use the extracted context), `src/_bff/modules/lyfta/services/sync-lyfta-workouts.service.ts` and its test (renamed imports only), `src/_bff/modules/training/repositories/activities.repository.ts` and its tests, `src/_bff/modules/training/types/index.ts` (`ActivitySource` gains `'zepp'`, new `NewZeppActivityRow`; fix every exhaustive use found by `pnpm typecheck`)

**Interfaces:**

- Produces: `ImportContext = { supabase: TrainingClient; timeZone: string }` and `createImportContext(user)` (the body of today's `createLyftaImportContext`, extracted and renamed; `LyftaImportContext` and `createLyftaImportContext` disappear and their callers update).
- Repository additions in `activities.repository.ts`: `selectSourceIds(supabase, userId, source: ActivitySource, sourceIds: string[]): Effect<Set<string>>`; `selectIdNearStartedAt(supabase, userId, startedAtIso: string, windowSeconds: number): Effect<string | null>` (any activity of the user with `started_at` within the window); `insertSourcedActivity(supabase, userId, source: 'zepp', row: NewZeppActivityRow): Effect<{ created: boolean }>` where a unique violation (Postgres code `23505`) returns `{ created: false }` and any other failure is `ActivityWriteError` with the `TRAINING_ZEPP_ACTIVITY_INSERT*` codes.
- Service: `importZeppActivity(user, summary: ZeppRunSummary, activity: AdaptedActivity, context: ImportContext): Effect<{ created: boolean }>`; computes `local_date` with `localDateIn(startedAt, context.timeZone)` and writes the row (`source_id = summary.trackId`, category and totals from the adapted activity, `hr_histogram`, `pace_histogram`), no laps and no `activity_files` row.

- [ ] **Step 1: Write failing tests.** Repository (fake DB, extend `fake-db.ts` with `gte`/`lte` and `in` only if missing): `insertSourcedActivity` creates a row with `source 'zepp'`, the `source_id` and the user's id; a second insert with the same `source_id` returns `{ created: false }` and leaves one row (pins the double-press case); `selectSourceIds` returns only matching ids of that user and source; `selectIdNearStartedAt` finds an activity 120 s away and not one 400 s away for a 300 s window, and never another user's. Service: a run starting at `2026-11-17T19:18:00Z` for an athlete in `Europe/Lisbon` gets `local_date '2026-11-17'`; one at `2026-11-17T23:50:00Z` for `Asia/Tokyo` gets `'2026-11-18'`. The Lyfta suites pass unchanged apart from the renamed import.
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/training src/_bff/modules/lyfta`. Expected: FAIL.
- [ ] **Step 3: Implement** the extraction, repository functions and service.
- [ ] **Step 4: Run** the same command plus `pnpm typecheck`. Expected: PASS.

---

### Task 8: Sync service, controllers, router and spec

**Files:**

- Create: `src/_bff/modules/zepp/constants/index.ts` additions, `src/_bff/modules/zepp/services/sync-zepp-activities.service.ts` and test, `src/_bff/modules/zepp/helpers/controller-errors.ts`, controllers `connect`, `disconnect`, `get-connection-status`, `sync-activities` (each `<NAME>_ZEPP_..._PROTECTED_CONTROLLER`, mirroring `lyfta/controllers/`) with a test per controller like `lyfta/controllers/__tests__`, `src/_bff/modules/zepp/zepp.router.ts`, `docs/tech-specs/zepp.md`
- Modify: `src/_bff/trpc/router.ts` (add `zepp: ZEPP_ROUTER`), `docs/tech-specs/README.md` (index row for `zepp.md`, data sources line no longer says Lyfta is the only integration)

**Interfaces:**

- Consumes: Tasks 3 to 7.
- Produces: constants `ZEPP_IMPORTED_SPORT_TYPES = [1] as const`, `MAX_DETAILS_PER_SYNC = 50`, `DETAIL_REQUEST_DELAY_MS = 500`, `DUPLICATE_WINDOW_SECONDS = 300`. `syncZeppActivities(user, deps?): Effect<{ imported: number; skipped: number; remaining: number }>`. Router `ZEPP_ROUTER` with `getConnectionStatus` (query), `connect` (mutation, zod input `{ email: string (email), password: string (min 1) }`), `syncActivities` (mutation), `disconnect` (mutation). `controller-errors.ts` exports `zeppControllerErrorCode` and `zeppControllerMessage` like the Lyfta helper, with messages: `ZeppLoginRejectedError` "Zepp rejected this email or password.", `ZeppSessionExpiredError` "Your Zepp session expired. Connect Zepp again.", `ZeppConnectionNotFoundError` "Connect Zepp first.", everything else a generic "Something went wrong. Try again."

Sync algorithm: load the connection (none: `ZeppConnectionNotFoundError`), decrypt, `fetchZeppHistory`, keep summaries whose `sportType` is in `ZEPP_IMPORTED_SPORT_TYPES` and `distanceM > 0`, newest first by `trackId`, drop those whose id `selectSourceIds` already knows, take the first `MAX_DETAILS_PER_SYNC` (`remaining` is the rest). For each: wait `DETAIL_REQUEST_DELAY_MS` between calls (injectable `sleep`), `fetchZeppDetail`, `adaptZeppRun`, skip (count in `skipped`) when `selectIdNearStartedAt(... DUPLICATE_WINDOW_SECONDS)` finds one, otherwise `importZeppActivity`; a `{ created: false }` counts as skipped. After the loop `updateZeppLastSyncedAt`. A `ZeppSessionExpiredError` aborts the sync and propagates. `next !== -1` is ignored for now (the spike's account returned its whole history with `-1`); `zepp.md` records this as an open question for when a longer history appears.

- [ ] **Step 1: Write failing tests** with fakes (fake API deps, fake DB, fake sleep): with the mock history and detail one run is imported (`imported 1`, `skipped 0`, `remaining 0`), one `zepp` activity exists with `source_id '1794943080'`, and the strength, treadmill and Hyrox rows are never fetched (the fake detail records its calls: exactly one); a run with `dis 0.0` is skipped and never fetched; running it twice imports once; with an activity already in the DB 142 s from the start, `skipped 1` and no new row; 53 distinct new runs give `imported 50`, `remaining 3`, and the fake sleep was called 49 times; an expired token propagates `ZeppSessionExpiredError` and does not update `last_synced_at`; no connection fails with `ZeppConnectionNotFoundError`. Controller tests follow the Lyfta ones (error mapped to the message above, unauthenticated untouched).
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/zepp`. Expected: FAIL.
- [ ] **Step 3: Implement** the service, helper, controllers and router; register the router.
- [ ] **Step 4: Write `docs/tech-specs/zepp.md`** (goals, endpoints and headers, decoding rules from Task 3, sentinels, what is imported and what is deliberately not, token handling, errors and copy, the open questions: token lifetime, paging when `next` is not `-1`, types 6 and 214 awaiting mocks) and update `README.md`.
- [ ] **Step 5: Run** `pnpm test`, `pnpm typecheck`, `pnpm check`, `pnpm knip`. Expected: all green.

---

### Task 9: Integrations tab shell

**Files:**

- Create: `src/modules/settings/integrations-tab.tsx`
- Rename: `src/modules/settings/lyfta-tab.tsx` to `lyfta-card.tsx` (component `LyftaCard`, behavior and every `data-testid` unchanged) and `__tests__/lyfta-tab.test.tsx` to `lyfta-card.test.tsx`
- Modify: `src/modules/settings/settings-tabs.tsx`, `src/modules/settings/settings-view.tsx`, `src/modules/settings/__tests__/settings-tabs.test.tsx`, any other reference found with `grep -rn "settings-tab-lyfta\|lyfta-tab\|LyftaTab" src`, `docs/tech-specs/lyfta.md` (Settings UX section)

**Interfaces:**

- Produces: `SettingsTabs` props `{ profile, dashboard, availability, integrations }` (the `lyfta` prop is replaced); tab value `integrations`, trigger `data-testid="settings-tab-integrations"` with the label "Integrations"; `IntegrationsTab` renders `<LyftaCard />` then (after Task 10) `<ZeppCard />` inside one container with `data-testid="integrations-tab"` and a heading "Integrations".

- [ ] **Step 1: Update the tests first.** `settings-tabs.test.tsx` expects `settings-tab-integrations` with text "Integrations" and no `settings-tab-lyfta`, and the panel stays mounted when switching tabs; the renamed `lyfta-card.test.tsx` imports `LyftaCard`; add `integrations-tab.test.tsx` asserting `lyfta-connected` or the Lyfta connect form is present inside `integrations-tab`.
- [ ] **Step 2: Run** `pnpm test src/modules/settings`. Expected: FAIL.
- [ ] **Step 3: Implement** the rename, the new tab and the props change.
- [ ] **Step 4: Run** `pnpm test src/modules/settings`, `pnpm typecheck`. Expected: PASS.

---

### Task 10: Zepp card

**Files:**

- Create: `src/modules/settings/zepp-card.tsx`, `src/modules/settings/use-zepp-connection.ts` (hook holds the zod schema, `FormValues` and the tRPC calls, like `use-lyfta-connection.ts`), `src/modules/settings/__tests__/zepp-card.test.tsx`, `src/modules/settings/__tests__/use-zepp-connection.test.ts`
- Modify: `src/modules/settings/integrations-tab.tsx` (render `<ZeppCard />` after Lyfta)

**Interfaces:**

- Consumes: `trpc.zepp.getConnectionStatus`, `connect`, `syncActivities`, `disconnect` (Task 8).
- Produces test ids: `zepp-card`, `zepp-loading`, `zepp-email`, `zepp-password`, `zepp-connect`, `zepp-connect-error`, `zepp-connected`, `zepp-sync`, `zepp-sync-result`, `zepp-sync-error`, `zepp-disconnect`.

Behavior: not connected shows a short explanation ("Import your outdoor runs from your Zepp account (Amazfit). Your password is used once to sign in and is never stored."), a react-hook-form `Form` with email (`type="email"`, `autoComplete="username"`) and password (`type="password"`, `autoComplete="current-password"`) using `FormField` + `FormControl` + `FormMessage`, and a Connect button. The password field is reset after every submit, success or failure. Connected shows "Zepp is connected", the last sync time when known (reuse the Lyfta card's date formatting helper), a Sync button, and Disconnect through `ConfirmDialog` (never raw `Dialog`). The sync result reads "Imported N runs" (singular for 1), plus "N already in Roxcoach" when `skipped > 0` and "More runs to sync, press Sync again" when `remaining > 0` (copy constant beside the Zepp card, like `LYFTA_MORE_TO_SYNC_MESSAGE`). After a successful sync or connect, invalidate `getCalendar` and the zepp status query. Server error messages come from the controller and are shown verbatim in `zepp-connect-error` or `zepp-sync-error`.

- [ ] **Step 1: Write failing tests** with a fake tRPC client passed in the way `lyfta-card.test.tsx` does: disconnected state shows email, password and Connect; invalid email shows a message and does not call connect; submitting calls connect once with the typed values and the password field is empty afterwards, also when connect rejects with "Zepp rejected this email or password." (shown in `zepp-connect-error`); connected state shows `zepp-connected` and Sync; syncing shows "Imported 2 runs", "1 already in Roxcoach" and the "press Sync again" line for `{ imported: 2, skipped: 1, remaining: 3 }`; singular copy for `imported: 1`; disconnect opens the confirm dialog and only calls disconnect after confirming.
- [ ] **Step 2: Run** `pnpm test src/modules/settings`. Expected: FAIL.
- [ ] **Step 3: Implement** the hook and the card following the Lyfta card's structure, spacing and loading skeleton.
- [ ] **Step 4: Run** `pnpm fmt`, `pnpm check`, `pnpm knip`, `pnpm typecheck`, `pnpm test`. Expected: all green.
- [ ] **Step 5: Hand back** to the athlete: add `NEXT_ZEPP_ENCRYPTION_KEY` to `.env.local`, run the migration, connect Zepp in Settings, press Sync, open an imported run. Report that this last check was not run by the agent (no dev server).
