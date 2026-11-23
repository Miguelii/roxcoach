// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Exit } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    DAY_S,
    detailCalls,
    history,
    NEWEST_RUN_S,
    NOW,
    run,
    setup,
    TOKEN,
} from '@/_bff/modules/zepp/services/__tests__/sync-zepp-fixtures'

describe('syncZeppActivities', () => {
    it('imports the one outdoor run of the real history and ignores every other workout', async () => {
        const { admin, fetcher, importActivity, sync } = setup()

        const exit = await sync()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 1,
            skipped: 0,
            updated: 0,
            remaining: 0,
        })
        expect(importActivity).toHaveBeenCalledTimes(1)
        expect(detailCalls(fetcher)).toHaveLength(1)
        expect(String(detailCalls(fetcher)[0]?.[0])).toContain('trackid=1794943080')
        expect(admin.calls[1]).toMatchObject({
            op: 'update',
            payload: { last_synced_at: '2026-11-21T10:00:00.000Z' },
        })
        const init = fetcher.mock.calls[0]?.[1]
        expect(init?.headers).toMatchObject({ apptoken: TOKEN })
    })

    it('does not fetch a run without distance', async () => {
        const { fetcher, sync } = setup({
            historyBody: history([run(NEWEST_RUN_S, '0.0'), run(NEWEST_RUN_S - 100)]),
        })

        await sync()

        expect(detailCalls(fetcher)).toHaveLength(1)
        expect(String(detailCalls(fetcher)[0]?.[0])).toContain(`trackid=${NEWEST_RUN_S - 100}`)
    })

    it('does not fetch a run that is already imported', async () => {
        const { fetcher, importActivity, sync } = setup({ known: ['1794943080'] })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 0,
            skipped: 0,
            updated: 0,
            remaining: 0,
        })
        expect(detailCalls(fetcher)).toHaveLength(0)
        expect(importActivity).not.toHaveBeenCalled()
    })

    it('counts a run the import skips as skipped', async () => {
        const { sync } = setup({ created: false })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 0,
            skipped: 1,
            updated: 0,
            remaining: 0,
        })
    })

    it('imports 60 new runs in one call, newest first, and waits between detail requests', async () => {
        const runs = Array.from({ length: 60 }, (_, index) => run(NEWEST_RUN_S - 100 + index))
        const { importedTrackIds, sleep, sync } = setup({ historyBody: history(runs) })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 60,
            skipped: 0,
            updated: 0,
            remaining: 0,
        })
        expect(sleep).toHaveBeenCalledTimes(59)
        expect(sleep).toHaveBeenCalledWith(500)
        expect(importedTrackIds[0]).toBe(String(NEWEST_RUN_S - 100 + 59))
        expect(importedTrackIds.at(-1)).toBe(String(NEWEST_RUN_S - 100))
    })

    it('keeps only the last 360 days of the history, before importing and before backfilling laps', async () => {
        const nowS = Math.floor(NOW.getTime() / 1000)
        const old = nowS - 361 * DAY_S
        const recent = nowS - 359 * DAY_S
        const { fetcher, importedTrackIds, replaceRunLaps, sync } = setup({
            historyBody: history([run(recent), run(old), run(old - 1)]),
            known: [String(old - 1)],
            withoutLaps: { [String(old - 1)]: 'activity-old' },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 1,
            skipped: 0,
            updated: 0,
            remaining: 0,
        })
        expect(importedTrackIds).toEqual([String(recent)])
        expect(detailCalls(fetcher)).toHaveLength(1)
        expect(replaceRunLaps).not.toHaveBeenCalled()
    })

    it('stops quietly when the connection is gone at the 25th detail and leaves the checkpoint alone', async () => {
        const runs = Array.from({ length: 60 }, (_, index) => run(NEWEST_RUN_S - 100 + index))
        const { checkpoints, importedTrackIds, selects, sync } = setup({
            historyBody: history(runs),
            connectionGoneAtRead: 2,
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(Exit.isSuccess(exit) && exit.value.imported).toBeLessThanOrEqual(25)
        expect(importedTrackIds.length).toBeLessThanOrEqual(25)
        expect(selects()).toBe(2)
        expect(checkpoints()).toHaveLength(0)
    })

    it('stops with an expired session and leaves the checkpoint alone', async () => {
        const { admin, sync } = setup({ historyStatus: 401 })

        const exit = await sync()

        expect(failureTag(exit)).toBe('ZeppSessionExpiredError')
        expect(admin.calls).toHaveLength(1)
    })

    it('fails when Zepp is not connected', async () => {
        const { fetcher, sync } = setup({ connection: false })

        expect(failureTag(await sync())).toBe('ZeppConnectionNotFoundError')
        expect(fetcher).not.toHaveBeenCalled()
    })

    it('does not fetch a run the athlete already uploaded by hand, nor spend the batch on it', async () => {
        const runs = Array.from({ length: 60 }, (_, index) => run(NEWEST_RUN_S - 100 + index))
        const duplicates = runs.slice(5).map((item) => String(item.trackid))
        const { fetcher, importedTrackIds, sync } = setup({
            historyBody: history(runs),
            duplicates,
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 5,
            skipped: 0,
            updated: 0,
            remaining: 0,
        })
        expect(detailCalls(fetcher)).toHaveLength(5)
        expect(importedTrackIds).toEqual(
            [4, 3, 2, 1, 0].map((offset) => String(NEWEST_RUN_S - 100 + offset))
        )
    })

    it('skips a run whose detail Zepp refuses and keeps going with the others', async () => {
        const { importedTrackIds, sync } = setup({
            historyBody: history([run(NEWEST_RUN_S), run(NEWEST_RUN_S - 100)]),
            detailBody: { code: 0, message: 'no data' },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 0,
            skipped: 2,
            updated: 0,
            remaining: 0,
        })
        expect(importedTrackIds).toEqual([])
    })

    it('adds the kilometre laps to a run imported before laps existed', async () => {
        const { fetcher, importActivity, replaceRunLaps, sync } = setup({
            known: ['1794943080'],
            withoutLaps: { '1794943080': 'activity-1' },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 0,
            skipped: 0,
            updated: 1,
            remaining: 0,
        })
        expect(importActivity).not.toHaveBeenCalled()
        expect(detailCalls(fetcher)).toHaveLength(1)
        expect(replaceRunLaps.mock.calls[0]?.[1]).toBe('activity-1')
        expect(replaceRunLaps.mock.calls[0]?.[2]).toHaveLength(4)
    })

    it('imports new runs first and leaves the laps for the next sync when the ceiling is reached', async () => {
        const runs = Array.from({ length: 1001 }, (_, index) => run(NEWEST_RUN_S - 2000 + index))
        const { replaceRunLaps, sync } = setup({
            historyBody: history(runs),
            known: [String(NEWEST_RUN_S - 2000)],
            withoutLaps: { [String(NEWEST_RUN_S - 2000)]: 'activity-1' },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 1000,
            skipped: 0,
            updated: 0,
            remaining: 1,
        })
        expect(replaceRunLaps).not.toHaveBeenCalled()
    })

    it('leaves a run without laps for the next sync when Zepp refuses its detail', async () => {
        const { replaceRunLaps, sync } = setup({
            known: ['1794943080'],
            withoutLaps: { '1794943080': 'activity-1' },
            detailBody: { code: 0, message: 'no data' },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toMatchObject({ updated: 0, remaining: 0 })
        expect(replaceRunLaps).not.toHaveBeenCalled()
    })
})
