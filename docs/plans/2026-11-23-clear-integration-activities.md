# Clear Integration Activities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each integration card in Settings > Integrations gets a confirmed "Clear activities" action that deletes the athlete's activities of that source and resets the sync checkpoint, inside a clearer card layout.

**Architecture:** `lyfta.clearActivities` and `zepp.clearActivities` mutations call a module service that refuses during a running sync, resets the checkpoint (service-role), then deletes through a `training` service filtered by `user_id` and `source`. `getActivityCount` queries feed the dialog and the card. Two shared components (`ClearActivitiesDialog`, `IntegrationDangerZone`) serve both cards.

**Tech Stack:** Next.js, tRPC, Effect v4, Supabase, TanStack Query, shadcn base-ui, vite-plus tests.

**Spec:** `docs/tech-specs/2026-11-23-clear-integration-activities-design.md`

## Global Constraints

- English everywhere, no em-dashes; `@/` imports; types at the top; named `type Props`; semantic tokens; no narrating comments; `cn()` for classes.
- Dialogs only through the shared `ConfirmDialog`. Tests: `pnpm test` only, fake dependencies, no module mocks for new code, `data-testid` only. Each commit passes `pnpm fmt`, `pnpm check`, `pnpm knip`. Nothing is pushed.
- Order inside a clear: refuse while a sync runs, reset `last_synced_at` first, delete activities second.
- Deletion is filtered by `user_id` and `source` (`'lyfta'` or `'zepp'`) and uses the signed-in athlete's client; nothing else is touched.
- Dialog copy (Lyfta; Zepp says "runs" and "laps"): title "Clear {count} Lyfta workouts?"; description "They are removed from your training history, with their sets. Run Sync to bring back the last 360 days; older workouts and anything you added to them by hand are lost."; confirm "Clear Lyfta activities"; cancel "Keep activities". Button disabled with zero activities.
- Toast on success: "Cleared {deleted} Lyfta workouts." (Zepp: "Cleared {deleted} Zepp runs.").

## Review Focus

1. **A running sync:** clearing is refused and nothing is reset or deleted. Pinned in Tasks 2 and 3.
2. **Failure order:** a failing delete leaves the checkpoint already reset (the next sync reimports); a failing reset deletes nothing. Pinned in Tasks 2 and 3.
3. **Scope of the delete:** only the athlete's rows of the one source (filters `user_id` and `source`). Pinned in Task 1.
4. **Zero or unknown count:** the clear button is disabled with zero and while the count loads or failed. Pinned in Tasks 4, 5 and 6.
5. **Double press and failure:** a second click while clearing sends nothing, and a failed clear keeps the dialog open with a message. Pinned in Tasks 5 and 6.

---

### Task 1: Count and delete by source (training)

**Files:**

- Modify: `src/_bff/modules/training/repositories/activities.repository.ts`, `src/_bff/lib/error-codes.ts`
- Create: `src/_bff/modules/training/services/source-activities.service.ts`, tests under `repositories/__tests__/` and `services/__tests__/`

**Interfaces:**

- Produces: `type ClearableSource = 'lyfta' | 'zepp'` (exported from `training/types`); repository `countActivitiesBySource(supabase: TrainingClient, userId: string, source: ClearableSource): Effect<number, ActivityQueryError>` (head count, filters `user_id` and `source`) and `deleteActivitiesBySource(supabase, userId, source): Effect<number, ActivityWriteError>` (delete filtered by `user_id` and `source`, `.select('id')`, returns the number of rows, zero is not an error); codes `TRAINING_SOURCE_ACTIVITIES_COUNT`, `_COUNT_ERR`, `_DELETE`, `_DELETE_ERR` as the next free `training` codes.
- Produces (service): `countSourceActivities(user: User, source: ClearableSource, dependencies?): Effect<number, CreateSbClientError | ActivityQueryError>` and `clearSourceActivities(user: User, source: ClearableSource, dependencies?): Effect<number, CreateSbClientError | ActivityWriteError>`; dependencies `{ createClient: () => Promise<TrainingClient> }`, default `createDBServerClient`.

- [ ] **Step 1: Write the failing repository tests** with `makeFakeAdminDb` and `asClient`: the count records filters `[['user_id', 'u1'], ['source', 'lyfta']]` and returns the `count` of the result (a null count reads as 0); the delete records the same two filters, returns the length of the returned rows and returns 0 for no rows; both fail with `ActivityQueryError` or `ActivityWriteError` carrying their `_ERR` code when the database answers an error.
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/training/repositories`. Expected: FAIL.
- [ ] **Step 3: Implement** the codes and the two repository functions following `deleteActivity`'s error handling (check both the catch and the returned error).
- [ ] **Step 4: Write the failing service tests** with a fake `createClient`: each function creates the client once and passes `user.id`; a failing client creation fails with `CreateSbClientError`.
- [ ] **Step 5: Implement** the service; **Run** `pnpm test src/_bff/modules/training` and `pnpm check`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(training): count and delete the activities of one source`.

### Task 2: Lyfta clear and count

**Files:**

- Modify: `src/_bff/modules/lyfta/repositories/lyfta-connections.repository.ts`, `src/_bff/modules/lyfta/lyfta.router.ts`, `src/_bff/modules/lyfta/helpers/controller-errors.ts` (only if a tag is missing), `docs/tech-specs/lyfta.md`
- Create: `src/_bff/modules/lyfta/services/clear-lyfta-activities.service.ts`, `controllers/clear-activities.controller.ts`, `controllers/get-activity-count.controller.ts`, tests

**Interfaces:**

- Consumes: Task 1 services.
- Produces: repository `resetLyftaCheckpoint(supabase: AdminClient, userId: string): Effect<void, LyftaConnectionWriteError>` (update `last_synced_at: null` filtered by `user_id`, code `LYFTA_CHECKPOINT`); `clearLyftaActivities(user: User, dependencies?): Effect<{ deleted: number }, ...>` and `getLyftaActivityCount(user: User): Effect<{ count: number }, ...>`; tRPC `lyfta.clearActivities` (mutation) and `lyfta.getActivityCount` (query), both protected, exhaustive error maps.
- `clearLyftaActivities` order: create the admin client, read the connection (none: `LyftaConnectionNotFoundError`), `toSyncState(connection.sync, lyftaSyncResultSchema, ErrorCode.LYFTA_SYNC_FAILED, now).status === 'running'` fails with `LyftaSyncInProgressError`, then `resetLyftaCheckpoint`, then `clearSourceActivities(user, 'lyfta')`.

- [ ] **Step 1: Write the failing service tests** with a fake admin db and fake training function: no connection fails with `LyftaConnectionNotFoundError` and never resets or deletes; a `running` connection started a minute ago fails with `LyftaSyncInProgressError`, no write call and no delete; a `running` connection older than `SYNC_LEASE_STALE_MS` is not blocking; success records the reset update (`last_synced_at: null`, filter `user_id`) BEFORE the delete is called (assert the call order) and returns `{ deleted: 3 }`; a failing delete fails with `ActivityWriteError` after the reset was recorded; a failing reset fails with `LyftaConnectionWriteError` and the delete is never called.
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/lyfta`. Expected: FAIL.
- [ ] **Step 3: Implement** the repository function, the two services, the two controllers (thin, exhaustive `Match`, `LyftaSyncInProgressError` CONFLICT with its fixed message through `lyftaControllerMessage`) and the router entries. Controller error maps must cover every tag these effects can fail with.
- [ ] **Step 4: Run** `pnpm test src/_bff/modules/lyfta` and `pnpm check`. Expected: PASS.
- [ ] **Step 5: Update `lyfta.md`** (a "Clear activities" section: what it deletes, the order, the refusal, the 360-day caveat) and add one line at the top of `db/seed/clear-lyfta-activities.sql` pointing to the button.
- [ ] **Step 6: Commit** `feat(lyfta): clear the imported activities and count them`.

### Task 3: Zepp clear and count

Mirror of Task 2 for Zepp: `resetZeppCheckpoint(supabase, userId)` (error code `ZEPP_CONNECTION_WRITE`), `clearZeppActivities(user, dependencies?)` in `services/clear-zepp-activities.service.ts` (uses `zeppSyncResultSchema`, `ErrorCode.ZEPP_SYNC_FAILED`, `ZeppSyncInProgressError` with `zeppControllerMessage`), `getZeppActivityCount`, controllers and the `zepp.clearActivities` and `zepp.getActivityCount` router entries, the same seven test cases (replace the names), `pnpm test src/_bff/modules/zepp`, `pnpm check`, a "Clear activities" section in `zepp.md`, commit `feat(zepp): clear the imported activities and count them`.

### Task 4: Shared dialog and danger zone

**Files:**

- Create: `src/components/clear-activities-dialog.tsx`, `src/components/integration-danger-zone.tsx`, tests under `src/components/__tests__/`

**Interfaces:**

- Produces: `ClearActivitiesDialog({ open, onOpenChange, onConfirm, clearing, error, provider, items, count, testIdPrefix, extra })` where `provider` is `'Lyfta' | 'Zepp'`, `items` is `'workouts' | 'runs'`, `count: number`, `extra: string` the clause after "with their" ("sets" or "laps"), test ids `${testIdPrefix}-clear-dialog`, `-clear-cancel`, `-clear-confirm`, `-clear-error`; built on `ConfirmDialog` with the copy of the Global Constraints, a destructive confirm button that shows a spinner and "Clearing..." while `clearing`.
- Produces: `IntegrationDangerZone({ provider, items, count, disabled, onClear, onDisconnect, testIdPrefix })` rendering a labelled section "Danger zone" with two rows, each a one-line explanation and a destructive outline button: `Clear activities` (test id `${testIdPrefix}-clear`, disabled when `count === undefined`, `count === 0` or `disabled`; the explanation shows the count when known) and `Disconnect` (test id `${testIdPrefix}-disconnect`, disabled by `disabled`). `count: number | undefined`.

- [ ] **Step 1: Write the failing tests**: the dialog title reads "Clear 142 Lyfta workouts?" and "Clear 1 Zepp run?" (singular), shows the description with the `extra` word, calls `onConfirm` from the confirm button, disables confirm and shows "Clearing..." while `clearing`, shows `error` in `-clear-error`, calls `onOpenChange(false)` from cancel; the danger zone disables `Clear activities` for `undefined` and for `0` and for `disabled`, enables it for 5, calls `onClear` and `onDisconnect`, and shows the count text.
- [ ] **Step 2: Run** `pnpm test src/components`. Expected: FAIL.
- [ ] **Step 3: Implement** both components (buttons at least 44 px tall on a phone, `cursor-pointer`, semantic tokens only, `aria-labelledby` on the section).
- [ ] **Step 4: Run** `pnpm test src/components` and `pnpm check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(settings): add the clear activities dialog and the danger zone`.

### Task 5: Lyfta card

**Files:**

- Modify: `src/modules/lyfta/lyfta-card.tsx`, `use-lyfta-connection.ts`, `lyfta-ui.utils.ts`, `src/modules/lyfta/__tests__/lyfta-card.test.tsx`, `docs/tech-specs/ux-design.md`
- Create: `src/modules/lyfta/use-clear-lyfta-activities.ts`

**Interfaces:**

- Consumes: Tasks 2 and 4.
- Produces: `useClearLyftaActivities(): { open: boolean; setOpen(open: boolean): void; clearing: boolean; error: string | null; clear(): Promise<void> }`: calls `lyfta.clearActivities`, on success closes the dialog, toasts "Cleared {deleted} Lyfta workouts." and invalidates `lyfta.getActivityCount`, `lyfta.getConnectionStatus`, `training.getCalendar` and `training.getStrengthProgress`; on failure keeps the dialog open with `messageForLyftaError`; a call while `clearing` does nothing. `useLyftaConnection` also exposes `activityCount: number | undefined` from `lyfta.getActivityCount` (refetched when a sync completes: invalidate it where the completion invalidates the training queries).
- Card layout: a header row with the name, a pill "Connected" or "Not connected" (green or slate tone, with text, not color alone) and the last sync; a line "{count} workouts imported" when known; the primary `Sync workouts` button; `Replace API key` as the secondary action; `IntegrationDangerZone` below a divider with `testIdPrefix="lyfta"` (keeps the existing `lyfta-disconnect` id). The existing test ids (`lyfta-sync`, `lyfta-replace-key`, `lyfta-disconnect`, the dialogs) are kept.

- [ ] **Step 1: Write the failing tests** in `lyfta-card.test.tsx` (add mocks for `lyfta.getActivityCount` and `lyfta.clearActivities`): the card shows the Connected pill and "142 workouts imported"; the clear button opens `lyfta-clear-dialog` with "Clear 142 Lyfta workouts?"; confirming calls the mutation once, closes the dialog, toasts "Cleared 3 Lyfta workouts." and invalidates the count, calendar and strength progress; a second click on confirm while clearing sends nothing; a rejection keeps the dialog open and shows its message in `lyfta-clear-error`; a refused overlap shows "A Lyfta sync is already running"; the clear button is disabled with a count of 0 and while the count is loading; it is disabled while a sync is running; the existing disconnect flow still works from the danger zone.
- [ ] **Step 2: Run** `pnpm test src/modules/lyfta`. Expected: FAIL.
- [ ] **Step 3: Implement** the hook, the connection hook change, the card layout and the code-to-message entries in `lyfta-ui.utils.ts`.
- [ ] **Step 4: Run** `pnpm test src/modules/lyfta src/modules/settings`, `pnpm check`, `pnpm knip`. Expected: PASS.
- [ ] **Step 5: Update `ux-design.md`** (the integration card layout and the danger zone).
- [ ] **Step 6: Commit** `feat(lyfta): clear activities from the integration card`.

### Task 6: Zepp card

Mirror of Task 5 for Zepp: `use-clear-zepp-activities.ts`, `useZeppConnection` exposing `activityCount`, the card layout (pill, "{count} runs imported", `Sync runs`-style primary action as today's `zepp-sync`, `Reconnect` as secondary, `IntegrationDangerZone` with `testIdPrefix="zepp"` keeping `zepp-disconnect`), the toast "Cleared {deleted} Zepp runs.", invalidating `zepp.getActivityCount`, `zepp.getConnectionStatus`, `training.getCalendar` and `training.getRunProgress`, the same tests in `zepp-card.test.tsx` with the dialog copy "Clear 142 Zepp runs?" and "laps", `pnpm test src/modules/zepp src/modules/settings`, `pnpm check`, `pnpm knip`, commit `feat(zepp): clear activities from the integration card`.
