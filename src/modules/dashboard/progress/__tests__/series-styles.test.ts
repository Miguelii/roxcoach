import { describe, expect, it } from 'vitest'
import {
    REPS_COLOR,
    ZONE_STYLES,
    type SeriesMarkerKind,
} from '@/modules/dashboard/progress/series-styles'

describe('series styles', () => {
    it('colours reps plum, as strength work', () => {
        expect(REPS_COLOR).toBe('var(--color-plum)')
    })

    it('uses amber and red for the hardest zones', () => {
        expect(ZONE_STYLES[4].color).toBe('var(--color-amber)')
        expect(ZONE_STYLES[5].color).toBe('var(--color-red)')
    })

    it('never uses orange for zones', () => {
        for (const zone of Object.values(ZONE_STYLES)) {
            expect(zone.color).not.toMatch(/signal|tangerine/u)
        }
    })

    it('tells every zone apart by more than colour', () => {
        const keys = Object.values(ZONE_STYLES).map(
            (zone: { dash: string | undefined; marker: SeriesMarkerKind }) =>
                `${zone.dash ?? 'solid'}-${zone.marker}`
        )
        expect(new Set(keys).size).toBe(keys.length)
    })
})
