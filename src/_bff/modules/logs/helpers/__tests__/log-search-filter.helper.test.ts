import { describe, expect, it } from 'vitest'
import { buildLogSearchFilter } from '@/_bff/modules/logs/helpers/log-search-filter.helper'

describe('buildLogSearchFilter', () => {
    it('matches the text on message and prefix as a quoted substring', () => {
        expect(buildLogSearchFilter('zepp')).toBe('message.ilike."%zepp%",prefix.ilike."%zepp%"')
    })

    it('escapes wildcards and reserved characters so the search stays one literal', () => {
        const pattern = String.raw`%a\\%b\\_c,d\"e)f%`

        expect(buildLogSearchFilter('a%b_c,d"e)f')).toBe(
            `message.ilike."${pattern}",prefix.ilike."${pattern}"`
        )
    })

    it('cannot close the quote and add a filter of its own', () => {
        const filter = buildLogSearchFilter('x",project.eq.wallet')

        expect(filter.match(/\.ilike\./gu)).toHaveLength(2)
        expect(filter).not.toContain(',project.eq.wallet"')
        expect(filter.startsWith('message.ilike."')).toBe(true)
    })
})
