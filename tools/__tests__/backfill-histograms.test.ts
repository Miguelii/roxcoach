import { describe, expect, it } from 'vitest'
import { formatBackfillOutput, parseUserIdArg } from '../backfill-histograms'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('parseUserIdArg', () => {
    it('accepts a uuid', () => {
        expect(parseUserIdArg(UUID)).toEqual({ ok: true, userId: UUID })
    })

    it.each([undefined, '', 'not-a-uuid', `${UUID}; drop table`, '../etc/passwd'])(
        'rejects %s',
        (arg) => {
            expect(parseUserIdArg(arg)).toEqual({ ok: false })
        }
    )
})

describe('formatBackfillOutput', () => {
    it('prints the counts line, then one line per failure with only id and code', () => {
        expect(
            formatBackfillOutput({
                updated: 3,
                failed: 1,
                failures: [{ activityId: 'a1', errorCode: 'p9k3w6ze' }],
            })
        ).toEqual(['updated: 3, failed: 1', 'failed a1: p9k3w6ze'])
    })

    it('prints only the counts line when nothing failed', () => {
        expect(formatBackfillOutput({ updated: 2, failed: 0, failures: [] })).toEqual([
            'updated: 2, failed: 0',
        ])
    })
})
