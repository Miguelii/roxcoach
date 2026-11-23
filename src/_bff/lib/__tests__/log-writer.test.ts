import { describe, expect, it, vi } from 'vitest'
import type { LogMetadata } from '@/_bff/lib/log-serializer'
import { buildLogRow, createLogWriter, type LogRow } from '@/_bff/lib/log-writer'

type Setup = { enabled?: boolean; insert?: (row: LogRow) => Promise<void> }

const setup = ({ enabled = true, insert }: Setup = {}) => {
    const rows: LogRow[] = []
    const scheduled: (() => Promise<void>)[] = []
    const failures: string[] = []
    const writer = createLogWriter({
        enabled,
        insert:
            insert ??
            (async (row) => {
                rows.push(row)
            }),
        schedule: (run) => {
            scheduled.push(run)
        },
        reportFailure: (message) => {
            failures.push(message)
        },
    })
    return { writer, rows, scheduled, failures }
}

const throwingInsert = (): Promise<void> => {
    throw new Error('sync boom')
}

describe('buildLogRow', () => {
    it('stamps the project and maps the log level to debug', () => {
        const row = buildLogRow({ level: 'log', prefix: 'p', message: 'm', userId: 'u1' })

        expect(row).toEqual({
            project: 'roxcoach',
            level: 'debug',
            prefix: 'p',
            message: 'm',
            metadata: null,
            user_id: 'u1',
        })
    })

    it('stores null for a missing message and user', () => {
        const row = buildLogRow({ level: 'info', prefix: 'p' })

        expect(row.message).toBeNull()
        expect(row.user_id).toBeNull()
    })

    it('redacts secrets in the metadata and in the error', () => {
        const row = buildLogRow({
            level: 'error',
            prefix: 'p',
            metadata: { apiKey: 'key-123', safe: 1 },
            error: { token: 'tok-456', detail: 'visible' },
        })

        expect(row.metadata).toEqual({
            apiKey: '[redacted]',
            safe: 1,
            error: { token: '[redacted]', detail: 'visible' },
        })
        expect(JSON.stringify(row)).not.toContain('key-123')
        expect(JSON.stringify(row)).not.toContain('tok-456')
    })
})

describe('createLogWriter', () => {
    it('schedules one insert of the built row when enabled', async () => {
        const { writer, rows, scheduled } = setup()

        writer.log({ level: 'error', prefix: 'p', message: 'boom' })
        expect(scheduled).toHaveLength(1)
        expect(rows).toHaveLength(0)

        await scheduled[0]()
        expect(rows).toEqual([buildLogRow({ level: 'error', prefix: 'p', message: 'boom' })])
    })

    it('does nothing when disabled', async () => {
        const { writer, rows, scheduled } = setup({ enabled: false })

        writer.log({ level: 'error', prefix: 'p' })
        await writer.persist({ level: 'error', prefix: 'p' })

        expect(scheduled).toHaveLength(0)
        expect(rows).toHaveLength(0)
    })

    it('awaits the insert in persist', async () => {
        const { writer, rows } = setup()

        await writer.persist({ level: 'info', prefix: 'p', message: 'done' })

        expect(rows).toHaveLength(1)
    })

    it('reports a rejected insert by message only and still resolves', async () => {
        const insert = vi.fn(async () => {
            throw new Error('db down')
        })
        const { writer, failures } = setup({ insert })

        await expect(writer.persist({ level: 'error', prefix: 'p' })).resolves.toBeUndefined()

        expect(failures).toEqual(['db down'])
    })

    it('survives an insert that throws synchronously', async () => {
        const { writer, scheduled, failures } = setup({ insert: throwingInsert })

        await expect(writer.persist({ level: 'error', prefix: 'p' })).resolves.toBeUndefined()
        writer.log({ level: 'error', prefix: 'p' })
        await scheduled[0]()

        expect(failures).toEqual(['sync boom', 'sync boom'])
    })

    it('never throws when the schedule or the row builder fails', () => {
        const writer = createLogWriter({
            enabled: true,
            insert: async () => {},
            schedule: () => {
                throw new Error('no request scope')
            },
            reportFailure: () => {},
        })
        const hostile: LogMetadata = {
            get explode(): string {
                throw new Error('getter')
            },
        }

        expect(() => writer.log({ level: 'error', prefix: 'p' })).not.toThrow()
        expect(() => writer.log({ level: 'error', prefix: 'p', metadata: hostile })).not.toThrow()
    })
})
