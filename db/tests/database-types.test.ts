// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { generateDbTypes } from '@/../tools/generate-db-types'

const COMMITTED = new URL('../../src/_bff/core/db/database.types.ts', import.meta.url)

// The formatter wraps long unions with a leading `|` and changes whitespace, neither is meaning.
const normalize = (source: string) => source.replaceAll(/\s+/gu, '').replaceAll(':|', ':')

describe('database.types.ts', () => {
    it('matches what db/migrations generate (run pnpm db:types when it fails)', async () => {
        const generated = await generateDbTypes()
        const committed = await readFile(COMMITTED, 'utf8')

        expect(normalize(committed)).toBe(normalize(generated))
    }, 60_000)
})
