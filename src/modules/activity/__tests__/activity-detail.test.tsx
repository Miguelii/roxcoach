import { describe, expect, it, vi } from 'vitest'
import { makeActivity } from '@/modules/calendar/__tests__/fixtures'
import { ActivityDetail } from '@/modules/activity/activity-detail'

const ID = '7a1f0f4e-3b0e-4c53-9a0a-6a3a3d2f9c11'

// notFound() throws an error whose digest marks a 404 for Next.js.
const isNotFound = (error: Error) => 'digest' in error && String(error.digest).endsWith(';404')

const caught = async (promise: Promise<unknown>) => {
    try {
        await promise
    } catch (error) {
        if (error instanceof Error) return error
    }
    throw new Error('expected a rejection')
}

describe('ActivityDetail', () => {
    it('calls notFound when the activity does not exist', async () => {
        const load = vi.fn().mockResolvedValue(null)

        const error = await caught(ActivityDetail({ params: Promise.resolve({ id: ID }), load }))

        expect(isNotFound(error)).toBe(true)
        expect(load).toHaveBeenCalledWith(ID)
    })

    it('calls notFound for a malformed id without loading', async () => {
        const load = vi.fn()

        const error = await caught(
            ActivityDetail({ params: Promise.resolve({ id: 'not-a-uuid' }), load })
        )

        expect(isNotFound(error)).toBe(true)
        expect(load).not.toHaveBeenCalled()
    })

    it('returns the view for an existing activity', async () => {
        const load = vi
            .fn()
            .mockResolvedValue({ activity: makeActivity(), laps: [], strengthSets: [] })

        const element = await ActivityDetail({ params: Promise.resolve({ id: ID }), load })

        expect(element.props.activity.name).toBe('Easy run')
    })
})
