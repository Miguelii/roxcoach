# Clear the activities of an integration (Settings > Integrations)

Short design (small change). Replaces running `db/seed/clear-lyfta-activities.sql` by hand.

## Intent

To start over with an integration (test a sync, fix bad imports) the athlete today has to run a SQL
script in Supabase. Each integration card in Settings > Integrations gets a button that does the
same thing for the signed-in athlete, with a confirmation, and the cards get a clearer layout.

## Goals

- `Clear Lyfta activities` and `Clear Zepp activities`: delete every activity of that source
  (`source = 'lyfta'` or `'zepp'`) of the signed-in athlete and forget the sync checkpoint
  (`last_synced_at = null`), so the next Sync imports them again. The connection (the saved key or
  token) stays. Strength sets, laps and station results go with the activity (on delete cascade).
- The confirmation is the shared `ConfirmDialog`. It states how many activities will be deleted and
  that only the last 360 days come back with a Sync (older ones are gone for good, and so is
  anything the athlete added by hand to them).
- Afterwards a toast says how many were deleted and the training views refresh.

## Non-goals and anti-goals

- No typed confirmation, no undo, no "clear everything" button across integrations.
- Anti-goal: touching another source's activities, races, profile, availability or coach data.
- Anti-goal: clearing while a sync of that integration is running (it would import them again).
- Anti-goal: ending with activities gone but the checkpoint still set, which would make the next
  Sync skip the history. The checkpoint is reset first, then the activities are deleted.

## Approaches considered

| Approach                                                                   | Trade-off                                                                                                         |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **A. One mutation per integration, deleting through a `training` service** | Same shape as `syncWorkouts`; each module owns its checkpoint reset, the deletion lives with the activities table |
| B. A new shared `integrations` module with `clear({ source })`             | One endpoint, but a new module that reaches into the Lyfta and Zepp connection tables                             |
| C. Only a database function (RPC)                                          | Atomic, but needs a migration and hides the rule from the code the athlete reads                                  |

**Chosen: A.** The reset-then-delete order gives the safe failure mode without a database function.

## Design

- **Backend.** `lyfta.clearActivities` and `zepp.clearActivities` (protected mutations, no input),
  returning `{ deleted: number }`. Each calls its module service, which: reads the connection (none:
  `*ConnectionNotFoundError`), takes the sync lease (the same compare-and-set and stale rule as a sync) and refuses with
  `*SyncInProgressError` when it is not free, releases it when it ends, resets `last_synced_at` through the module repository (service-role),
  then calls `deleteActivitiesBySource(user, source)` of the `training` module (cross-module through
  its service), which deletes with the signed-in athlete's client filtered by `user_id` and `source`
  and returns the count. The training views are refreshed by the client.
- **Count for the dialog.** `lyfta.getActivityCount` and `zepp.getActivityCount` (protected queries)
  return `{ count }`: the athlete's activities of that source (one head count query filtered by
  `user_id` and `source`). It is a separate query, not a field of `getConnectionStatus`, so the
  status and the connect and disconnect results keep their shape. The card shows it too ("142
  workouts imported") and refreshes it after a clear and after a sync ends.
- **Cards.** Each card becomes a status header (name, a Connected or Not connected pill, last sync
  and the imported count), the primary `Sync` action, the secondary actions (`Replace key` or
  `Reconnect`) and, below a divider, a "Danger zone" with `Clear activities` and `Disconnect` as
  destructive buttons with a one-line explanation each. Buttons keep the 44 px touch size, are
  disabled while a sync or another action runs, and show a spinner while clearing.
- **Dialog copy.** "Clear 142 Lyfta workouts?" / "They are removed from your training history, with
  their sets. Run Sync to bring back the last 360 days; older workouts and anything you added to
  them by hand are lost." Confirm: `Clear Lyfta activities`; cancel: `Keep activities`. Zepp uses
  "runs" and its laps. With zero activities the button is disabled.
- **Errors.** A refused overlap shows the provider's "sync already running" message; any other
  failure shows a mapped message in the dialog.
- **Docs to update.** `lyfta.md`, `zepp.md` (new section), `ux-design.md` (the cards), and a pointer
  from `db/seed/clear-lyfta-activities.sql`'s header to the button.

## Left to the builder

- Exact component split (a shared `IntegrationDangerZone` is welcome if both cards use it as is).
- The wording of the error messages and the `ErrorCode` numbers, following the existing pattern.
- Whether `activityCount` shows while the status loads (a skeleton) or only after.
