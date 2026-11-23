import 'server-only'

import { configure, tasks } from '@trigger.dev/sdk'
import type { SyncTaskPayload } from '@/_bff/core/helpers/sync-state.helper'
import { ServerEnv } from '@/env/server'

let configured = false

export async function triggerTask(
    taskId: string,
    payload: SyncTaskPayload,
    idempotencyKey: string
): Promise<{ id: string }> {
    const secretKey = ServerEnv.TRIGGER_SECRET_KEY
    if (secretKey === undefined) throw new Error('TRIGGER_SECRET_KEY is not configured')
    if (!configured) {
        configure({ secretKey })
        configured = true
    }
    const handle = await tasks.trigger(taskId, payload, { idempotencyKey })
    return { id: handle.id }
}
