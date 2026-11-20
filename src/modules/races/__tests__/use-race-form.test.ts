import { describe, expect, it } from 'vitest'
import {
    createRaceSchema,
    emptyRaceFormValues,
    raceToFormValues,
    toRaceInput,
    type RaceFormValues,
} from '@/modules/races/use-race-form'
import { HYROX_RACE, RUN_RACE, TODAY } from '@/modules/races/__tests__/fixtures'

const schema = createRaceSchema(TODAY)

const HYROX_VALUES: RaceFormValues = {
    ...emptyRaceFormValues('open_men'),
    name: 'Hyrox Lisbon',
    raceDate: '2026-11-21',
    targetTime: '1:10:00',
}
const RUN_VALUES: RaceFormValues = {
    ...HYROX_VALUES,
    raceType: 'running',
    hyroxDivision: '',
    distanceKm: '10',
    targetTime: '39:59',
}

const firstError = (values: Partial<RaceFormValues>, base = HYROX_VALUES) => {
    const result = schema.safeParse({ ...base, ...values })
    return result.success ? null : result.error.issues[0]
}

describe('race form schema', () => {
    it('accepts valid hyrox and running values', () => {
        expect(schema.safeParse(HYROX_VALUES).success).toBe(true)
        expect(schema.safeParse(RUN_VALUES).success).toBe(true)
    })

    it('checks the name at its boundaries', () => {
        expect(firstError({ name: '   ' })?.path).toEqual(['name'])
        expect(firstError({ name: 'a'.repeat(81) })?.path).toEqual(['name'])
        expect(firstError({ name: 'a'.repeat(80) })).toBeNull()
    })

    it('requires a date strictly after today', () => {
        expect(firstError({ raceDate: TODAY })?.path).toEqual(['raceDate'])
        expect(firstError({ raceDate: '' })?.path).toEqual(['raceDate'])
        expect(firstError({ raceDate: '2026-11-21' })).toBeNull()
    })

    it('requires a distance for running, bounded 0.4 to 200 km', () => {
        const path = ['distanceKm']
        expect(firstError({ distanceKm: '' }, RUN_VALUES)?.path).toEqual(path)
        expect(firstError({ distanceKm: 'ten' }, RUN_VALUES)?.path).toEqual(path)
        expect(firstError({ distanceKm: '0.39' }, RUN_VALUES)?.path).toEqual(path)
        expect(firstError({ distanceKm: '0.4' }, RUN_VALUES)).toBeNull()
        expect(firstError({ distanceKm: '200' }, RUN_VALUES)).toBeNull()
        expect(firstError({ distanceKm: '200.1' }, RUN_VALUES)?.path).toEqual(path)
    })

    it('ignores the distance for hyrox and requires a division', () => {
        expect(firstError({ distanceKm: '' })).toBeNull()
        expect(firstError({ hyroxDivision: '' })?.path).toEqual(['hyroxDivision'])
    })

    it('does not require a division for running or other races', () => {
        expect(firstError({ hyroxDivision: '' }, RUN_VALUES)).toBeNull()
        expect(firstError({ raceType: 'other', hyroxDivision: '' })).toBeNull()
    })

    it('rejects invalid goal times and checks the 1 minute to 24 hour range', () => {
        const path = ['targetTime']
        expect(firstError({ targetTime: '' })?.path).toEqual(path)
        expect(firstError({ targetTime: 'fast' })?.path).toEqual(path)
        expect(firstError({ targetTime: '1:75:00' })?.path).toEqual(path)
        expect(firstError({ targetTime: '0:59' })?.path).toEqual(path)
        expect(firstError({ targetTime: '1:00' })).toBeNull()
        expect(firstError({ targetTime: '24:00:00' })).toBeNull()
        expect(firstError({ targetTime: '24:00:01' })?.path).toEqual(path)
    })

    it('limits location to 80 and notes to 500 characters', () => {
        expect(firstError({ location: 'a'.repeat(81) })?.path).toEqual(['location'])
        expect(firstError({ location: 'a'.repeat(80) })).toBeNull()
        expect(firstError({ notes: 'a'.repeat(501) })?.path).toEqual(['notes'])
        expect(firstError({ notes: 'a'.repeat(500) })).toBeNull()
    })
})

describe('toRaceInput', () => {
    it('converts hyrox values: no distance, division kept, blanks become null', () => {
        expect(toRaceInput({ ...HYROX_VALUES, distanceKm: '5', location: ' ' })).toEqual({
            name: 'Hyrox Lisbon',
            raceType: 'hyrox',
            raceDate: '2026-11-21',
            location: null,
            distanceM: null,
            hyroxDivision: 'open_men',
            targetTimeS: 4200,
            priority: 'A',
            notes: null,
        })
    })

    it('converts running values: km to meters, no division, goal 39:59', () => {
        const input = toRaceInput({
            ...RUN_VALUES,
            hyroxDivision: 'open_men',
            distanceKm: '10.5',
            location: ' Lisbon ',
        })
        expect(input).toMatchObject({
            distanceM: 10500,
            hyroxDivision: null,
            targetTimeS: 2399,
            location: 'Lisbon',
        })
    })

    it('keeps neither distance nor division for other races', () => {
        expect(
            toRaceInput({ ...RUN_VALUES, raceType: 'other', hyroxDivision: 'open_men' })
        ).toMatchObject({ distanceM: null, hyroxDivision: null })
    })
})

describe('form value mapping', () => {
    it('starts empty with the profile division', () => {
        expect(emptyRaceFormValues('pro_women')).toMatchObject({
            raceType: 'hyrox',
            hyroxDivision: 'pro_women',
            priority: 'A',
        })
        expect(emptyRaceFormValues(null).hyroxDivision).toBe('')
    })

    it('turns a race into form strings', () => {
        expect(raceToFormValues(HYROX_RACE)).toMatchObject({
            targetTime: '1:10:00',
            distanceKm: '',
            hyroxDivision: 'open_men',
            notes: 'Bring grips',
        })
        expect(raceToFormValues(RUN_RACE)).toMatchObject({
            targetTime: '40:00',
            distanceKm: '10',
            location: '',
        })
    })
})
