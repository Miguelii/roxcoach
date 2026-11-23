'use client'

import { useEffect, useRef } from 'react'
import type { SyncState } from '@/_bff/core/helpers/sync-state.helper'
import { finishedSync, sameRun } from '@/lib/sync-state'

// `startedRunAt` is the run this tab just started: a run that ends before the first status refetch
// (an expired Zepp session fails within a second) is still announced.
export function useSyncCompletion<R>(
    sync: SyncState<R> | undefined,
    onFinished: (sync: SyncState<R>) => void,
    startedRunAt: string | null = null
): void {
    const seenRunningAt = useRef<string | null>(null)
    const announcedAt = useRef<string | null>(null)
    const onFinishedRef = useRef(onFinished)

    useEffect(() => {
        onFinishedRef.current = onFinished
    })

    useEffect(() => {
        if (startedRunAt !== null) seenRunningAt.current = startedRunAt
        if (!sync) return
        if (sync.status === 'running') {
            seenRunningAt.current = sync.startedAt
            return
        }
        if (
            finishedSync(seenRunningAt.current, sync) &&
            !sameRun(announcedAt.current, sync.startedAt)
        ) {
            announcedAt.current = sync.startedAt
            onFinishedRef.current(sync)
        }
    }, [sync, startedRunAt])
}
