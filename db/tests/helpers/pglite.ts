import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

export type TestDb = {
    db: PGlite
    asUser(userId: string, options?: { access?: boolean }): Promise<void>
    asService(): Promise<void>
    asSuperuser(): Promise<void>
    close(): Promise<void>
}

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url)

// Minimal stand-ins for what Supabase provides before our migrations run.
const SUPABASE_STUBS = `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;

    create schema auth;
    grant usage on schema auth to anon, authenticated, service_role;

    create table auth.users (id uuid primary key, raw_app_meta_data jsonb);

    create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
    $$;

    create function auth.uid() returns uuid language sql stable as $$
        select nullif(auth.jwt() ->> 'sub', '')::uuid
    $$;
`

// Files are concatenated in filename order and run as one script, which keeps the order strict.
async function applyMigrations(db: PGlite): Promise<void> {
    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).toSorted()
    const scripts = await Promise.all(
        files.map((file) => readFile(new URL(file, MIGRATIONS_DIR), 'utf8'))
    )
    await db.exec(scripts.join('\n'))
}

async function setClaims(db: PGlite, claims: string): Promise<void> {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims])
}

export async function createTestDb(): Promise<TestDb> {
    const db = await PGlite.create()
    await db.exec(SUPABASE_STUBS)
    await applyMigrations(db)

    return {
        db,
        async asUser(userId, options) {
            const access = options?.access ?? true
            const claims = access
                ? { sub: userId, app_metadata: { roxcoach: true } }
                : { sub: userId }
            await db.exec('reset role')
            await setClaims(db, JSON.stringify(claims))
            await db.exec('set role authenticated')
        },
        async asService() {
            await db.exec('reset role')
            await setClaims(db, '')
            await db.exec('set role service_role')
        },
        async asSuperuser() {
            await db.exec('reset role')
            await setClaims(db, '')
        },
        close: () => db.close(),
    }
}
