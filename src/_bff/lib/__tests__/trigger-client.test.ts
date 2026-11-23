// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

// ServerEnv reads the environment when it is first imported, so the key is unset before a fresh
// import: the test never depends on a local key nor reaches the real Trigger.dev API.
const importWithoutSecretKey = async () => {
    vi.stubEnv('TRIGGER_SECRET_KEY', '')
    vi.resetModules()
    return import('@/_bff/lib/trigger-client')
}

describe('triggerTask', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('rejects without enqueueing when TRIGGER_SECRET_KEY is not configured', async () => {
        const { triggerTask } = await importWithoutSecretKey()

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
