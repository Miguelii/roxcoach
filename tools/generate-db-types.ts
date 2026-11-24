// Run with: pnpm db:types
// Applies db/migrations to an in-memory Postgres (PGlite) and writes the table, column and enum
// types to src/_bff/core/db/database.types.ts. No Supabase access is needed, the migrations are the
// source of truth. db/tests/database-types.test.ts fails when the committed file is stale.

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createTestDb } from '@db/tests/helpers/pglite'
import type { PGlite } from '@electric-sql/pglite'

type ColumnRow = {
    table_schema: string
    table_name: string
    column_name: string
    udt_name: string
    data_type: string
    is_nullable: 'YES' | 'NO'
    column_default: string | null
    is_generated: 'ALWAYS' | 'NEVER'
    identity_generation: string | null
}

type EnumRow = { schema: string; name: string; labels: string[] }

type Column = { name: string; type: string; nullable: boolean; optionalOnInsert: boolean }

const SCHEMAS = ['roxcoach', 'public']
const OUTPUT = fileURLToPath(new URL('../src/_bff/core/db/database.types.ts', import.meta.url))

const SCALARS = new Map<string, string>([
    ['uuid', 'string'],
    ['text', 'string'],
    ['varchar', 'string'],
    ['bpchar', 'string'],
    ['date', 'string'],
    ['time', 'string'],
    ['timestamp', 'string'],
    ['timestamptz', 'string'],
    ['int2', 'number'],
    ['int4', 'number'],
    ['int8', 'number'],
    ['float4', 'number'],
    ['float8', 'number'],
    ['numeric', 'number'],
    ['bool', 'boolean'],
    ['json', 'Json'],
    ['jsonb', 'Json'],
])

function tsType(row: ColumnRow, enums: Map<string, string>): string {
    if (row.data_type === 'ARRAY') {
        const element = row.udt_name.slice(1)
        return `(${SCALARS.get(element) ?? enums.get(`${row.table_schema}.${element}`) ?? 'unknown'})[]`
    }
    return (
        SCALARS.get(row.udt_name) ?? enums.get(`${row.table_schema}.${row.udt_name}`) ?? 'unknown'
    )
}

const literal = (labels: string[]) => labels.map((label) => `'${label}'`).join(' | ')

function renderTable(name: string, columns: Column[]): string {
    const field = (column: Column, optional: boolean) =>
        `${column.name}${optional ? '?' : ''}: ${column.type}${column.nullable ? ' | null' : ''}`
    const lines = (pick: (column: Column) => boolean) =>
        columns.map((column) => `                    ${field(column, pick(column))}`).join('\n')

    return `            ${name}: {
                Row: {
${lines(() => false)}
                }
                Insert: {
${lines((column) => column.optionalOnInsert)}
                }
                Update: {
${lines(() => true)}
                }
            }`
}

async function readColumns(db: PGlite): Promise<ColumnRow[]> {
    const { rows } = await db.query<ColumnRow>(
        `select c.table_schema, c.table_name, c.column_name, c.udt_name, c.data_type, c.is_nullable,
                c.column_default, c.is_generated, c.identity_generation
         from information_schema.columns c
         join information_schema.tables t
           on t.table_schema = c.table_schema and t.table_name = c.table_name
         where c.table_schema = any($1) and t.table_type = 'BASE TABLE'
         order by c.table_schema, c.table_name, c.ordinal_position`,
        [SCHEMAS]
    )
    return rows.filter((row) => row.table_name !== 'schema_migrations')
}

async function readEnums(db: PGlite): Promise<EnumRow[]> {
    const { rows } = await db.query<EnumRow>(
        `select n.nspname as schema, t.typname as name,
                array_agg(e.enumlabel order by e.enumsortorder) as labels
         from pg_type t
         join pg_enum e on e.enumtypid = t.oid
         join pg_namespace n on n.oid = t.typnamespace
         where n.nspname = any($1)
         group by n.nspname, t.typname
         order by n.nspname, t.typname`,
        [SCHEMAS]
    )
    return rows
}

export async function generateDbTypes(): Promise<string> {
    const testDb = await createTestDb()
    try {
        const [columns, enumRows] = await Promise.all([
            readColumns(testDb.db),
            readEnums(testDb.db),
        ])
        const enums = new Map(
            enumRows.map((row) => [`${row.schema}.${row.name}`, literal(row.labels)])
        )

        const blocks = SCHEMAS.map((schema) => {
            const tables = Map.groupBy(
                columns.filter((row) => row.table_schema === schema),
                (row) => row.table_name
            )
            const tableBlocks = [...tables].map(([name, rows]) =>
                renderTable(
                    name,
                    rows.map((row) => ({
                        name: row.column_name,
                        type: tsType(row, enums),
                        nullable: row.is_nullable === 'YES',
                        optionalOnInsert:
                            row.is_nullable === 'YES' ||
                            row.column_default !== null ||
                            row.is_generated === 'ALWAYS' ||
                            row.identity_generation !== null,
                    }))
                )
            )
            const enumBlocks = enumRows
                .filter((row) => row.schema === schema)
                .map((row) => `            ${row.name}: ${literal(row.labels)}`)

            return `    ${schema}: {
        Tables: {
${tableBlocks.join('\n')}
        }
        Enums: {
${enumBlocks.join('\n')}
        }
    }`
        })

        return `// Generated by tools/generate-db-types.ts from db/migrations. Do not edit, run pnpm db:types.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Database = {
${blocks.join('\n')}
}
`
    } finally {
        await testDb.close()
    }
}

async function main(): Promise<void> {
    await writeFile(OUTPUT, await generateDbTypes())
}

if (process.argv[1] === import.meta.filename) {
    main().catch((error: Error) => {
        console.error(error)
        process.exitCode = 1
    })
}
