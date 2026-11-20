import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Any value a roxcoach claim could carry. Deliberately loose so tests can check that only the
// boolean true in app_metadata grants access.
type FlagValue = boolean | string | number | null | Record<string, never>

// JWT claims as Supabase puts them in request.jwt.claims. user_metadata is writable by the user
// themselves (auth.updateUser), so it must never grant anything.
export type Claims = {
    sub?: string
    app_metadata?: { roxcoach?: FlagValue }
    user_metadata?: { roxcoach?: FlagValue }
}

export type TestDb = {
    db: PGlite
    asUser(userId: string, options?: { access?: boolean }): Promise<void>
    asClaims(claims: Claims | null): Promise<void>
    asAnon(): Promise<void>
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

    create table auth.users (id uuid primary key, email text unique, raw_app_meta_data jsonb);

    create function auth.jwt() returns jsonb language sql stable as $$
        select nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;

    create function auth.uid() returns uuid language sql stable as $$
        select nullif(auth.jwt() ->> 'sub', '')::uuid
    $$;

    -- The real storage schema is managed by Supabase. These are the minimal parts migration 0008
    -- uses: buckets, objects with RLS on, and foldername().
    create schema storage;
    grant usage on schema storage to anon, authenticated, service_role;

    create table storage.buckets (
        id text primary key,
        name text not null,
        public boolean not null default false,
        file_size_limit bigint,
        allowed_mime_types text[]
    );

    create table storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text references storage.buckets (id),
        name text,
        owner uuid default auth.uid()
    );
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated;
    grant all on storage.objects to service_role;

    -- Folder parts of an object name, without the file name (as Supabase's helper does).
    create function storage.foldername(name text) returns text[] language sql immutable as $$
        select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
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

    async function asClaims(claims: Claims | null): Promise<void> {
        await db.exec('reset role')
        await setClaims(db, claims === null ? '' : JSON.stringify(claims))
        await db.exec('set role authenticated')
    }

    return {
        db,
        async asUser(userId, options) {
            const access = options?.access ?? true
            await asClaims(
                access ? { sub: userId, app_metadata: { roxcoach: true } } : { sub: userId }
            )
        },
        asClaims,
        async asAnon() {
            await db.exec('reset role')
            await setClaims(db, '')
            await db.exec('set role anon')
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
