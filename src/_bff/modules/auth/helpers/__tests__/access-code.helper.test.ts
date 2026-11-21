import { describe, expect, it } from 'vitest'
import { isValidAccessCode } from '@/_bff/modules/auth/helpers/access-code.helper'

const CODE = 'correct-horse-battery'

describe('isValidAccessCode', () => {
    it('accepts the exact code', () => {
        expect(isValidAccessCode(CODE, CODE)).toBe(true)
    })

    it('trims the input', () => {
        expect(isValidAccessCode(`  ${CODE}\n`, CODE)).toBe(true)
    })

    it('rejects a different code, a prefix and a longer code', () => {
        expect(isValidAccessCode('wrong-horse-battery', CODE)).toBe(false)
        expect(isValidAccessCode('correct-horse', CODE)).toBe(false)
        expect(isValidAccessCode(`${CODE}x`, CODE)).toBe(false)
    })

    it('rejects an empty input and never matches an empty expected code', () => {
        expect(isValidAccessCode('', CODE)).toBe(false)
        expect(isValidAccessCode('', '')).toBe(false)
    })

    it('compares unicode by value', () => {
        expect(isValidAccessCode('códigó-secreto-1234', 'códigó-secreto-1234')).toBe(true)
        expect(isValidAccessCode('codigo-secreto-1234', 'códigó-secreto-1234')).toBe(false)
    })
})
