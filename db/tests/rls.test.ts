// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type Claims, type TestDb } from '@db/tests/helpers/pglite'

type NameRow = { name: string }
type RlsRow = { name: string; enabled: boolean }
type PolicyRow = {
    tablename: string
    cmd: string
    roles: string[]
    qual: string | null
    with_check: string | null
}
type PrivilegeRow = { name: string; any_privilege: boolean }
type FunctionRow = { security_definer: boolean; volatility: string; config: string[] | null }
type AccessRow = { has_access: boolean }

// RLS on, no policies: only the service role touches them.
const SERVICE_ONLY_TABLES = new Set([
    'schema_migrations',
    'strava_connections',
    'strava_webhook_events',
])

// How PostgreSQL prints the owner check of every client policy.
const OWNER_CHECK = '((user_id = auth.uid()) AND roxcoach.has_access())'

const USER_ID = '00000000-0000-4000-8000-000000000001'

let testDb: TestDb
let allTables: string[]

beforeAll(async () => {
    testDb = await createTestDb()
    await testDb.asSuperuser()
    const result = await testDb.db.query<NameRow>(
        `select table_name as name from information_schema.tables
         where table_schema = 'roxcoach' and table_type = 'BASE TABLE' order by table_name`
    )
    allTables = result.rows.map((row) => row.name)
})

afterAll(async () => {
    await testDb.close()
})

describe('row level security setup', () => {
    it('enables RLS on every table in the roxcoach schema', async () => {
        await testDb.asSuperuser()
        const result = await testDb.db.query<RlsRow>(
            `select c.relname as name, c.relrowsecurity as enabled
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'roxcoach' and c.relkind in ('r', 'p') order by c.relname`
        )

        expect(allTables.length).toBeGreaterThan(0)
        expect(result.rows).toEqual(allTables.map((name) => ({ name, enabled: true })))
    })

    it('gives every client table one owner-checked policy per operation for authenticated', async () => {
        await testDb.asSuperuser()
        const result = await testDb.db.query<PolicyRow>(
            `select tablename, cmd, roles::text[] as roles, qual, with_check
             from pg_policies where schemaname = 'roxcoach' order by tablename, cmd`
        )
        const expected = allTables.flatMap((table) =>
            SERVICE_ONLY_TABLES.has(table)
                ? []
                : [
                      {
                          tablename: table,
                          cmd: 'DELETE',
                          roles: ['authenticated'],
                          qual: OWNER_CHECK,
                          with_check: null,
                      },
                      {
                          tablename: table,
                          cmd: 'INSERT',
                          roles: ['authenticated'],
                          qual: null,
                          with_check: OWNER_CHECK,
                      },
                      {
                          tablename: table,
                          cmd: 'SELECT',
                          roles: ['authenticated'],
                          qual: OWNER_CHECK,
                          with_check: null,
                      },
                      {
                          tablename: table,
                          cmd: 'UPDATE',
                          roles: ['authenticated'],
                          qual: OWNER_CHECK,
                          with_check: OWNER_CHECK,
                      },
                  ]
        )

        expect(result.rows).toEqual(expected)
    })

    it('grants authenticated no privilege at all on the service-only tables', async () => {
        await testDb.asSuperuser()
        const result = await testDb.db.query<PrivilegeRow>(
            `select table_name as name,
                has_table_privilege('authenticated', 'roxcoach.' || table_name,
                    'select, insert, update, delete, truncate, references, trigger') as any_privilege
             from information_schema.tables
             where table_schema = 'roxcoach' and table_name = any($1) order by table_name`,
            [[...SERVICE_ONLY_TABLES]]
        )

        expect(result.rows).toEqual(
            [...SERVICE_ONLY_TABLES].toSorted().map((name) => ({ name, any_privilege: false }))
        )
    })

    it('defines has_access() as a stable security invoker function with an empty search_path', async () => {
        await testDb.asSuperuser()
        const result = await testDb.db.query<FunctionRow>(
            `select p.prosecdef as security_definer, p.provolatile as volatility, p.proconfig as config
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'roxcoach' and p.proname = 'has_access'`
        )

        expect(result.rows).toEqual([
            { security_definer: false, volatility: 's', config: ['search_path=""'] },
        ])
    })
})

describe('roxcoach.has_access()', () => {
    it.each([
        ['no claims at all', null, false],
        ['claims without app_metadata', { sub: USER_ID }, false],
        ['app_metadata without the flag', { sub: USER_ID, app_metadata: {} }, false],
        ['the string "true"', { sub: USER_ID, app_metadata: { roxcoach: 'true' } }, false],
        ['the string "t"', { sub: USER_ID, app_metadata: { roxcoach: 't' } }, false],
        ['the number 1', { sub: USER_ID, app_metadata: { roxcoach: 1 } }, false],
        ['a non-boolean string', { sub: USER_ID, app_metadata: { roxcoach: 'yes' } }, false],
        ['boolean false', { sub: USER_ID, app_metadata: { roxcoach: false } }, false],
        ['boolean true', { sub: USER_ID, app_metadata: { roxcoach: true } }, true],
    ] satisfies [string, Claims | null, boolean][])('with %s', async (_label, claims, expected) => {
        await testDb.asClaims(claims)
        const result = await testDb.db.query<AccessRow>(
            'select roxcoach.has_access() as has_access'
        )

        expect(result.rows).toEqual([{ has_access: expected }])
    })
})
