// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Data } from 'effect'
import { z } from 'zod'
import { runTool } from '@/_bff/modules/coach/tools/run-tool'

class GetThingError extends Data.TaggedError('GetThingError')<{
    cause: string
    error_hash: string
}> {}

describe('runTool failure trace', () => {
    afterEach(() => vi.restoreAllMocks())

    it('logs only the tag and error_hash and returns the fixed result', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const failure = new GetThingError({ cause: 'secret cause text', error_hash: 'abcd1234' })

        const result = await runTool(
            z.object({ q: z.string() }),
            { q: 'private-input' },
            async () => {
                throw failure
            }
        )

        expect(result).toEqual({ error: 'could not read data' })
        const logged = JSON.stringify(spy.mock.calls)
        expect(logged).toContain('GetThingError')
        expect(logged).toContain('abcd1234')
        expect(logged).not.toContain('secret cause text')
        expect(logged).not.toContain('private-input')
    })
})
