// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { successValue } from '@/_bff/lib/tests-utils'
import { resolveSyncMissingWindow } from '@/_bff/modules/strava/services/resolve-sync-missing-window.service'
import {
    settleStravaActivityEvents,
    settleStravaEvent,
} from '@/_bff/modules/strava/services/settle-strava-event.service'
import { makeFakeAdminDb, ok } from '@/_bff/modules/strava/services/__tests__/fake-admin-db'
import { syncHandler, USER_ID } from '@/_bff/modules/strava/services/__tests__/sync-fixtures'

const { createDBAdminClientMock } = vi.hoisted(() => ({ createDBAdminClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({ createDBAdminClient: createDBAdminClientMock }))
vi.mock('@/env/server', () => ({ ServerEnv: {} }))

afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
})

describe('settleStravaEvent', () => {
    it('writes the status and the safe message on the event row', async () => {
        const db = makeFakeAdminDb(() => ok())
        createDBAdminClientMock.mockReturnValue(db.supabase)

        await settleStravaEvent(USER_ID, 'event-1', 'failed', 'StravaApiError:abc')

        expect(db.calls).toEqual([
            expect.objectContaining({
                table: 'strava_webhook_events',
                op: 'update',
                payload: { status: 'failed', error: 'StravaApiError:abc' },
                filters: [
                    ['id', 'event-1'],
                    ['user_id', USER_ID],
                ],
            }),
        ])
    })

    it('never rejects when the update fails', async () => {
        createDBAdminClientMock.mockReturnValue(
            makeFakeAdminDb(() => ({ error: { code: '42501', message: 'denied' } })).supabase
        )

        await expect(settleStravaEvent(USER_ID, 'event-1', 'processed')).resolves.toBeUndefined()
    })
})

describe('settleStravaActivityEvents', () => {
    it('settles the other received events of the activity as processed', async () => {
        const db = makeFakeAdminDb(() => ok())
        createDBAdminClientMock.mockReturnValue(db.supabase)

        await settleStravaActivityEvents(USER_ID, 42)

        expect(db.calls).toEqual([
            expect.objectContaining({
                table: 'strava_webhook_events',
                op: 'update',
                filters: [
                    ['user_id', USER_ID],
                    ['object_type', 'activity'],
                    ['object_id', 42],
                    ['status', 'received'],
                ],
            }),
        ])
    })

    it('never rejects when the update fails', async () => {
        createDBAdminClientMock.mockReturnValue(
            makeFakeAdminDb(() => ({ error: { code: '42501', message: 'denied' } })).supabase
        )

        await expect(settleStravaActivityEvents(USER_ID, 42)).resolves.toBeUndefined()
    })
})

describe('settleStravaEvent with a broken client factory', () => {
    it('never rejects when the client factory throws', async () => {
        createDBAdminClientMock.mockImplementation(() => {
            throw new Error('missing service role key')
        })
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        await expect(settleStravaEvent(USER_ID, 'event-1', 'failed', 'x')).resolves.toBeUndefined()
        expect(error).toHaveBeenCalled()
    })
})

describe('resolveSyncMissingWindow', () => {
    it('starts 7 days before the last successful sync', async () => {
        const db = makeFakeAdminDb((call) =>
            call.table === 'strava_connections'
                ? ok({
                      user_id: USER_ID,
                      strava_athlete_id: 7,
                      access_token: 'a',
                      refresh_token: 'r',
                      expires_at: '2026-11-19T18:00:00+00:00',
                      scope: 'read',
                      connected_at: null,
                      last_synced_at: '2026-03-01T00:00:00+00:00',
                  })
                : ok()
        )
        createDBAdminClientMock.mockReturnValue(db.supabase)

        const exit = await Effect.runPromiseExit(resolveSyncMissingWindow(USER_ID))

        // `after` filters on the start date: an activity recorded before the last sync and uploaded
        // later is still found.
        expect(successValue(exit)).toBe(
            Date.parse('2026-03-01T00:00:00Z') / 1000 - 7 * 24 * 60 * 60
        )
    })

    it('falls back to 12 months when the connection never synced', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
        createDBAdminClientMock.mockReturnValue(makeFakeAdminDb(syncHandler()).supabase)

        const exit = await Effect.runPromiseExit(resolveSyncMissingWindow(USER_ID))

        expect(successValue(exit)).toBe(
            Date.parse('2026-06-01T00:00:00Z') / 1000 - 365 * 24 * 60 * 60
        )
    })
})
