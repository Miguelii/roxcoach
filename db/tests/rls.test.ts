// @vitest-environment node
/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUser, seedUserGraph } from '@db/tests/helpers/fixtures'
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
type CountRow = { count: number }

// RLS on, no policies: only the service role touches them.
const SERVICE_ONLY_TABLES = new Set(['lyfta_connections', 'schema_migrations', 'zepp_connections'])

// Tables whose client rows are never deleted by a client: they have no DELETE policy.
const NO_DELETE_POLICY_TABLES = new Set(['coach_usage'])

// How PostgreSQL prints the owner check of every client policy: both calls sit in a subselect so
// they run once per statement (an InitPlan) instead of once per row.
const OWNER_CHECK =
    '((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT roxcoach.has_access() AS has_access))'

const INSUFFICIENT_PRIVILEGE = '42501'
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
                      ...(NO_DELETE_POLICY_TABLES.has(table)
                          ? []
                          : [
                                {
                                    tablename: table,
                                    cmd: 'DELETE',
                                    roles: ['authenticated'],
                                    qual: OWNER_CHECK,
                                    with_check: null,
                                },
                            ]),
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
        ['a null flag', { sub: USER_ID, app_metadata: { roxcoach: null } }, false],
        ['an object flag', { sub: USER_ID, app_metadata: { roxcoach: {} } }, false],
        [
            'user_metadata true and no app_metadata flag',
            { sub: USER_ID, user_metadata: { roxcoach: true } },
            false,
        ],
        [
            'user_metadata true and an empty app_metadata',
            { sub: USER_ID, app_metadata: {}, user_metadata: { roxcoach: true } },
            false,
        ],
        [
            'user_metadata true and app_metadata false',
            { sub: USER_ID, app_metadata: { roxcoach: false }, user_metadata: { roxcoach: true } },
            false,
        ],
        ['boolean true', { sub: USER_ID, app_metadata: { roxcoach: true } }, true],
        [
            'boolean true in app_metadata next to a false user_metadata',
            { sub: USER_ID, app_metadata: { roxcoach: true }, user_metadata: { roxcoach: false } },
            true,
        ],
    ] satisfies [string, Claims | null, boolean][])('with %s', async (_label, claims, expected) => {
        await testDb.asClaims(claims)
        const result = await testDb.db.query<AccessRow>(
            'select roxcoach.has_access() as has_access'
        )

        expect(result.rows).toEqual([{ has_access: expected }])
    })
})

// Users can write their own user_metadata through auth.updateUser, so on a shared project that is
// the most realistic self-grant attempt. None of these sessions may see the user's own rows.
describe('self-grant attempts', () => {
    let ownerId: string
    let clientTables: string[]

    beforeAll(async () => {
        ownerId = await createUser(testDb)
        await seedUserGraph(testDb, ownerId)
        clientTables = allTables.filter((table) => !SERVICE_ONLY_TABLES.has(table))
    })

    async function visibleRows(claims: Claims): Promise<number> {
        await testDb.asClaims(claims)
        const counts = await Promise.all(
            clientTables.map((table) =>
                testDb.db.query<CountRow>(`select count(*)::int as count from roxcoach.${table}`)
            )
        )
        return counts.reduce((sum, result) => sum + (result.rows[0]?.count ?? 0), 0)
    }

    it('sees the own rows with the real flag (control)', async () => {
        expect(
            await visibleRows({ sub: ownerId, app_metadata: { roxcoach: true } })
        ).toBeGreaterThan(0)
    })

    it.each([
        ['user_metadata.roxcoach = true only', { user_metadata: { roxcoach: true } }],
        [
            'user_metadata.roxcoach = true with an empty app_metadata',
            { app_metadata: {}, user_metadata: { roxcoach: true } },
        ],
        ['app_metadata.roxcoach = null', { app_metadata: { roxcoach: null } }],
        ['app_metadata.roxcoach = {}', { app_metadata: { roxcoach: {} } }],
        ["app_metadata.roxcoach = 'true'", { app_metadata: { roxcoach: 'true' } }],
    ] satisfies [string, Claims][])('sees zero rows with %s', async (_label, extra) => {
        expect(await visibleRows({ sub: ownerId, ...extra })).toBe(0)
    })
})

describe('activity-files bucket policies', () => {
    const insertObject = (userId: string, folder: string) =>
        testDb.db.query(
            `insert into storage.objects (bucket_id, name) values ('activity-files', $1 || '/a.fit')`,
            [folder || userId]
        )

    it("a user cannot insert an object under another user's folder", async () => {
        await testDb.asUser(USER_ID)

        await expect(
            testDb.db.query(
                `insert into storage.objects (bucket_id, name) values ('activity-files', $1)`,
                ['00000000-0000-4000-8000-000000000002/a.fit']
            )
        ).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE })
        await expect(insertObject(USER_ID, '')).resolves.toBeDefined()
    })

    it('an authenticated user without the access flag cannot insert at all', async () => {
        await testDb.asUser(USER_ID, { access: false })

        await expect(insertObject(USER_ID, '')).rejects.toMatchObject({
            code: INSUFFICIENT_PRIVILEGE,
        })
    })
})
