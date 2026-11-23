import { describe, expect, it } from 'vitest'
import { finishedSync, pollWhileSyncing } from '@/lib/sync-state'

describe('pollWhileSyncing', () => {
    it('polls every 5 seconds only while a sync is running', () => {
        expect(pollWhileSyncing({ sync: { status: 'running', startedAt: 't1' } })).toBe(5000)
        expect(pollWhileSyncing({ sync: { status: 'idle', startedAt: null } })).toBe(false)
        expect(pollWhileSyncing({ sync: { status: 'succeeded', startedAt: 't1' } })).toBe(false)
        expect(pollWhileSyncing({ sync: { status: 'failed', startedAt: 't1' } })).toBe(false)
        expect(pollWhileSyncing(undefined)).toBe(false)
    })
})

describe('finishedSync', () => {
    it('is true only when the run seen running has ended', () => {
        expect(finishedSync('t1', { status: 'succeeded', startedAt: 't1' })).toBe(true)
        expect(finishedSync('t1', { status: 'failed', startedAt: 't1' })).toBe(true)
        expect(finishedSync(null, { status: 'succeeded', startedAt: 't1' })).toBe(false)
        expect(finishedSync('t1', { status: 'succeeded', startedAt: 't2' })).toBe(false)
        expect(finishedSync('t1', { status: 'running', startedAt: 't1' })).toBe(false)
        expect(finishedSync('t1', { status: 'idle', startedAt: 't1' })).toBe(false)
    })
})
