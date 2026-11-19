import { describe, expect, it } from 'vitest'
import { HYROX_STATIONS, type HyroxStation } from '@/_bff/core/constants/hyrox.constants'
import { detectHyroxStations } from '@/_bff/modules/strava/helpers/detect-hyrox-stations.helper'

const unnamed = (count: number) => Array.from({ length: count }, () => ({ name: 'Lap' }))
const named = (names: Array<string | null | undefined>) => names.map((name) => ({ name }))
const allNull = (count: number) => Array.from({ length: count }, () => null)

describe('detectHyroxStations', () => {
    it('tags exactly 16 laps as alternating run and station in race order', () => {
        const result = detectHyroxStations(unnamed(16))

        expect(result).toHaveLength(16)
        const stationKeys: HyroxStation[] = HYROX_STATIONS.map((station) => station.key)
        result.forEach((tag, index) => {
            if (index % 2 === 0) expect(tag).toBeNull()
            else expect(tag).toBe(stationKeys[(index - 1) / 2])
        })
    })

    it('tags 16 laps even when the names are missing', () => {
        const laps = Array.from({ length: 16 }, () => ({}))

        expect(detectHyroxStations(laps)[1]).toBe('ski_erg')
        expect(detectHyroxStations(laps)[15]).toBe('wall_balls')
    })

    it('tags laps by recognisable station names, case-insensitively', () => {
        const result = detectHyroxStations(
            named([
                'Run 1',
                'SKIERG',
                'Run 2',
                'Sled Push',
                'sled pull',
                'Burpee Broad Jumps',
                'Row',
                'Farmers Carry',
                'Sandbag Lunges',
                'Wall Balls',
                'Ski Erg',
            ])
        )

        expect(result).toEqual([
            null,
            'ski_erg',
            null,
            'sled_push',
            'sled_pull',
            'burpee_broad_jump',
            'rowing',
            'farmers_carry',
            'sandbag_lunges',
            'wall_balls',
            'ski_erg',
        ])
    })

    it('tags a partial session and leaves the other laps null', () => {
        const result = detectHyroxStations(named(['Warm up', 'Wall Ball', 'Rest', 'Burpees']))

        expect(result).toEqual([null, 'wall_balls', null, 'burpee_broad_jump'])
    })

    it('recognises name variants', () => {
        const result = detectHyroxStations(
            named(["Farmer's carry", 'Rowing', 'Lunges', 'wallballs', 'Sled', 'Sled Pushes'])
        )

        expect(result).toEqual([
            'farmers_carry',
            'rowing',
            'sandbag_lunges',
            'wall_balls',
            null,
            'sled_push',
        ])
    })

    it('accepts hyphens and underscores as separators', () => {
        const result = detectHyroxStations(
            named([
                'Ski-Erg',
                'Sled_Push',
                'Wall-Ball',
                'Sled-Pull',
                'sled_pull',
                'ski_erg',
                'Wall_Balls',
            ])
        )

        expect(result).toEqual([
            'ski_erg',
            'sled_push',
            'wall_balls',
            'sled_pull',
            'sled_pull',
            'ski_erg',
            'wall_balls',
        ])
    })

    it('does not tag substrings of unrelated words as rowing', () => {
        const result = detectHyroxStations(named(['Barrow hill', 'Tomorrow', 'Arrow']))

        expect(result).toEqual([null, null, null])
    })

    it('leaves a lap null when its name matches more than one station', () => {
        const result = detectHyroxStations(named(['SkiErg and row', 'Sled Push']))

        expect(result).toEqual([null, 'sled_push'])
    })

    it('prefers names over position when a 16 lap list carries station names', () => {
        const names: Array<string | null> = Array.from(
            { length: 16 },
            (_, index) => `Lap ${index + 1}`
        )
        names[4] = 'Wall Balls'

        const result = detectHyroxStations(named(names))

        expect(result[4]).toBe('wall_balls')
        expect(result.filter((tag) => tag !== null)).toHaveLength(1)
    })

    it.each([15, 17, 0])('returns all null for %s unnamed laps', (count) => {
        expect(detectHyroxStations(unnamed(count))).toEqual(allNull(count))
    })

    it('returns all null for a plain 10 x 1 km run', () => {
        const laps = Array.from({ length: 10 }, (_, index) => ({ name: `Lap ${index + 1}` }))

        expect(detectHyroxStations(laps)).toEqual(allNull(10))
    })
})
