# Logs

Server errors and the sync info events are persisted in the shared `public.logs` table and read on
the `/logs` page. The decision and the reasoning are in
[2026-11-23-logs-page-design.md](2026-11-23-logs-page-design.md); the table is described in
[database.md](database.md) and the logger in [architecture.md](architecture.md).

## What is logged

- **Errors:** every `Logger({ level: 'error' })` call, including the `runEffect` boundary, the
  failures of the Trigger.dev sync tasks (one `warn` row per retried attempt, one `error` row for a
  permanent failure, or one `error` row when every attempt failed without an abort) and the errors Next reports through
  `onRequestError` (`src/instrumentation.ts`, prefix `request`), except tRPC errors, which `runEffect` already logged. A row
  without a message takes the tag of its error as the message.
- **Info events** (prefix `lyftaSync` or `zeppSync`): `Sync started` when the start service
  enqueues the task (metadata `runId`) and `Sync succeeded` when the task finishes (the stored
  result counts and `durationMs`).
- Rows are written only when `NODE_ENV === 'production'`. Every row carries `project: 'roxcoach'`
  and, when known, the athlete's `user_id`. Secrets are redacted by the logger's serializer.

## API

`logs.getAll` (protected query). Input `{ range: '30m' | '1h' | '24h' | '7d' | '30d', search?:
string (trimmed, max 200) }`. Output `{ logs: LogEntry[], isTruncated: boolean }`: the 1000 most
recent Roxcoach rows since the start of the range, newest first, filtered by `message` or `prefix`
containing the search (wildcards escaped, value quoted). `isTruncated` is true when the limit was
reached. Not cached. Every signed-in athlete sees every Roxcoach row, including rows without a
`user_id`. Errors: `LogsClientError` (`logs001`) and `LogsQueryError` (`logs002`), both
`INTERNAL_SERVER_ERROR`.

## Page

`/logs` is a server page: it reads `range` and `search` from the URL (nuqs), calls `logs.getAll`
with the server caller and renders `LogsExplorer` with the rows, `isTruncated` and the fetch time
(the end of the histogram window). Level and source filters and the selected row are client state
over the fetched rows. Details and design: [ux-design.md](ux-design.md#logs). The link to `/logs` is
a sidebar item on desktop and a link at the bottom of Settings on a phone.
