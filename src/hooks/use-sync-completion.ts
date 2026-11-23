'use client'

import { useEffect, useRef } from 'react'
import type { SyncState } from '@/_bff/core/helpers/sync-state.helper'
import { finishedSync } from '@/lib/sync-state'

export function useSyncCompletion<R>(
    sync: SyncState<R> | undefined,
    onFinished: (sync: SyncState<R>) => void
): void {
    const seenRunningAt = useRef<string | null>(null)
    const onFinishedRef = useRef(onFinished)

    useEffect(() => {
        onFinishedRef.current = onFinished
    })

    useEffect(() => {
        if (!sync) return
        if (sync.status === 'running') {
            seenRunningAt.current = sync.startedAt
            return
        }
        if (finishedSync(seenRunningAt.current, sync)) {
            seenRunningAt.current = null
            onFinishedRef.current(sync)
        }
    }, [sync])
}
