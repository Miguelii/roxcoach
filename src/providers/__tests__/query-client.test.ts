import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '@/providers/query-client'

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

const failing = () => Promise.reject(new Error('internal_hash'))

describe('makeQueryClient', () => {
    afterEach(() => {
        mocks.toastError.mockClear()
    })

    it('toasts a failed query with its meta message and the query hash as id', async () => {
        const client = makeQueryClient()
        const queryKey = ['goals']

        await client
            .fetchQuery({
                queryKey,
                queryFn: failing,
                retry: false,
                meta: { errorMessage: "Could not load this week's goals." },
            })
            .catch(() => {})

        const hash = client.getQueryCache().find({ queryKey })?.queryHash
        expect(mocks.toastError).toHaveBeenCalledTimes(1)
        expect(mocks.toastError).toHaveBeenCalledWith("Could not load this week's goals.", {
            id: hash,
        })
    })

    it('falls back to a generic message without meta', async () => {
        const client = makeQueryClient()

        await client
            .fetchQuery({ queryKey: ['other'], queryFn: failing, retry: false })
            .catch(() => {})

        expect(mocks.toastError).toHaveBeenCalledWith('Could not load your data.', {
            id: client.getQueryCache().find({ queryKey: ['other'] })?.queryHash,
        })
    })
})
