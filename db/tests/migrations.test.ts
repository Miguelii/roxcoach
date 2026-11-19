// @vitest-environment node
import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

type MigrationFile = { filename: string; sql: string }

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url)

// Statements Postgres refuses inside a transaction block, which would break the begin/commit wrap.
const NOT_TRANSACTIONAL = [
    /create\s+(unique\s+)?index\s+concurrently/iu,
    /alter\s+type\s+[^;]*add\s+value/iu,
    /\bvacuum\b/iu,
    /create\s+database/iu,
]

async function readMigrations(): Promise<MigrationFile[]> {
    const filenames = (await readdir(MIGRATIONS_DIR))
        .filter((file) => file.endsWith('.sql'))
        .toSorted()
    return Promise.all(
        filenames.map(async (filename) => ({
            filename,
            sql: (await readFile(new URL(filename, MIGRATIONS_DIR), 'utf8')).trim(),
        }))
    )
}

describe('migration files', () => {
    it('are numbered without gaps', async () => {
        const files = await readMigrations()

        expect(files.map((file) => file.filename.slice(0, 4))).toEqual(
            files.map((_file, index) => String(index + 1).padStart(4, '0'))
        )
    })

    it('apply atomically: the first statement is begin and the last is commit', async () => {
        for (const { filename, sql } of await readMigrations()) {
            const lines = sql.split('\n')
            expect(lines[0], filename).toBe('begin;')
            expect(lines.at(-1), filename).toBe('commit;')
            expect(sql.match(/^begin;$/gmu), filename).toHaveLength(1)
            expect(sql.match(/^commit;$/gmu), filename).toHaveLength(1)
        }
    })

    it('record themselves as the last statement before the commit', async () => {
        for (const { filename, sql } of await readMigrations()) {
            const lines = sql.split('\n')

            expect(lines.at(-2), filename).toBe(
                `insert into roxcoach.schema_migrations (filename) values ('${filename}');`
            )
        }
    })

    it('contain no statement that cannot run inside a transaction', async () => {
        for (const { filename, sql } of await readMigrations()) {
            for (const pattern of NOT_TRANSACTIONAL) {
                expect(sql, `${filename} ${pattern}`).not.toMatch(pattern)
            }
        }
    })
})
