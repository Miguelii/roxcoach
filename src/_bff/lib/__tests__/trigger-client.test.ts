// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { triggerTask } from '@/_bff/lib/trigger-client'

describe('triggerTask', () => {
    it('rejects without enqueueing when TRIGGER_SECRET_KEY is not configured', async () => {
        await expect(
            triggerTask(
                'sync-lyfta-workouts',
                {
                    userId: '6f1c2c1e-6a35-4f1b-9d0e-6a7a3c0f4b21',
                    startedAt: '2026-11-23T10:00:00.000Z',
                },
                'lyfta:6f1c2c1e-6a35-4f1b-9d0e-6a7a3c0f4b21:2026-11-23T10:00:00.000Z'
            )
        ).rejects.toThrow('TRIGGER_SECRET_KEY is not configured')
    })
})
