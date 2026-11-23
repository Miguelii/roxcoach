// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'
import { asClient, failureTag } from '@/_bff/lib/tests-utils'
import { getAthleteDisplayNames } from '@/_bff/modules/athlete/services/get-athlete-display-names.service'

describe('getAthleteDisplayNames', () => {
    it('maps each athlete id to its display name with one query filtered by those ids', async () => {
        const db = makeFakeAdminDb(() =>
            ok([
                { user_id: 'u1', display_name: 'Ana' },
                { user_id: 'u2', display_name: 'Rui' },
            ])
        )

        const names = await Effect.runPromise(
            getAthleteDisplayNames(['u1', 'u2'], { createAdminClient: () => asClient(db.supabase) })
        )

        expect(names).toEqual(
            new Map([
                ['u1', 'Ana'],
                ['u2', 'Rui'],
            ])
        )
        expect(db.calls).toHaveLength(1)
        expect(db.calls[0].table).toBe('athlete_profiles')
        expect(db.calls[0].filters).toEqual([['user_id:in', ['u1', 'u2']]])
    })

    it('does not query when there are no ids', async () => {
        const db = makeFakeAdminDb(() => ok([]))

        const names = await Effect.runPromise(
            getAthleteDisplayNames([], { createAdminClient: () => asClient(db.supabase) })
        )

        expect(names.size).toBe(0)
        expect(db.calls).toHaveLength(0)
    })

    it('fails with ProfileQueryError when the query answers an error', async () => {
        const db = makeFakeAdminDb(() => ({
            data: null,
            error: { code: 'XX001', message: 'boom' },
        }))

        const exit = await Effect.runPromiseExit(
            getAthleteDisplayNames(['u1'], { createAdminClient: () => asClient(db.supabase) })
        )

        expect(failureTag(exit)).toBe('ProfileQueryError')
    })
})
