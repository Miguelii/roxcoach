import { describe, expect, it } from 'vitest'
import {
    validateRace,
    validateResultTime,
} from '@/_bff/modules/races/helpers/race-validation.helper'
import type { RaceInput } from '@/_bff/modules/races/types'

const TODAY = '2026-11-20'

const RUNNING: RaceInput = {
    name: 'Sao Silvestre',
    raceType: 'running',
    raceDate: '2026-12-31',
    location: null,
    distanceM: 10000,
    hyroxDivision: null,
    targetTimeS: 2399,
    priority: 'A',
    notes: null,
}
const HYROX: RaceInput = {
    ...RUNNING,
    name: 'Hyrox Lisbon',
    raceType: 'hyrox',
    distanceM: null,
    hyroxDivision: 'open_men',
    targetTimeS: 4200,
}

const check = (input: Partial<RaceInput>, base = RUNNING, options = {}) =>
    validateRace({ ...base, ...input }, TODAY, options)

describe('validateRace', () => {
    it('accepts valid running, hyrox and other races', () => {
        expect(check({})).toEqual({ ok: true })
        expect(check({}, HYROX)).toEqual({ ok: true })
        expect(check({ raceType: 'other', distanceM: null })).toEqual({ ok: true })
    })

    it('checks the name length after trimming', () => {
        expect(check({ name: '   ' })).toMatchObject({ ok: false, field: 'name' })
        expect(check({ name: 'a'.repeat(81) })).toMatchObject({ ok: false, field: 'name' })
        expect(check({ name: ` ${'a'.repeat(80)} ` })).toEqual({ ok: true })
    })

    it('requires a date strictly after today', () => {
        expect(check({ raceDate: TODAY })).toMatchObject({ ok: false, field: 'raceDate' })
        expect(check({ raceDate: '2026-11-21' })).toEqual({ ok: true })
    })

    it('allows a past date when allowPastDate is set, but never an invalid one', () => {
        expect(check({ raceDate: '2026-01-01' }, RUNNING, { allowPastDate: true })).toEqual({
            ok: true,
        })
        expect(check({ raceDate: '2026-02-30' }, RUNNING, { allowPastDate: true })).toMatchObject({
            ok: false,
            field: 'raceDate',
        })
        expect(check({ raceDate: 'tomorrow' })).toMatchObject({ ok: false, field: 'raceDate' })
    })

    it('bounds the running distance at 400 and 200000 m and requires it', () => {
        expect(check({ distanceM: 399 })).toMatchObject({ ok: false, field: 'distanceM' })
        expect(check({ distanceM: 400 })).toEqual({ ok: true })
        expect(check({ distanceM: 200000 })).toEqual({ ok: true })
        expect(check({ distanceM: 200001 })).toMatchObject({ ok: false, field: 'distanceM' })
        expect(check({ distanceM: null })).toMatchObject({ ok: false, field: 'distanceM' })
    })

    it('requires a known division and no distance for hyrox', () => {
        expect(check({ distanceM: 1000 }, HYROX)).toMatchObject({ ok: false, field: 'distanceM' })
        expect(check({ hyroxDivision: null }, HYROX)).toMatchObject({
            ok: false,
            field: 'hyroxDivision',
        })
    })

    it('rejects a division on a race that is not hyrox', () => {
        expect(check({ hyroxDivision: 'open_men' })).toMatchObject({
            ok: false,
            field: 'hyroxDivision',
        })
        expect(
            check({ raceType: 'other', distanceM: null, hyroxDivision: 'open_men' })
        ).toMatchObject({ ok: false, field: 'hyroxDivision' })
    })

    it('rejects a distance on an other race', () => {
        expect(check({ raceType: 'other', distanceM: 5000 })).toMatchObject({
            ok: false,
            field: 'distanceM',
        })
    })

    it('bounds the target time at 60 and 86400 s', () => {
        expect(check({ targetTimeS: 59 })).toMatchObject({ ok: false, field: 'targetTimeS' })
        expect(check({ targetTimeS: 60 })).toEqual({ ok: true })
        expect(check({ targetTimeS: 86400 })).toEqual({ ok: true })
        expect(check({ targetTimeS: 86401 })).toMatchObject({ ok: false, field: 'targetTimeS' })
        expect(check({ targetTimeS: 90.5 })).toMatchObject({ ok: false, field: 'targetTimeS' })
    })

    it('limits location to 80 and notes to 500 characters', () => {
        expect(check({ location: 'a'.repeat(81) })).toMatchObject({ ok: false, field: 'location' })
        expect(check({ location: 'a'.repeat(80) })).toEqual({ ok: true })
        expect(check({ notes: 'a'.repeat(501) })).toMatchObject({ ok: false, field: 'notes' })
        expect(check({ notes: 'a'.repeat(500) })).toEqual({ ok: true })
    })
})

describe('validateResultTime', () => {
    it('accepts 1 to 86400 whole seconds', () => {
        expect(validateResultTime(1)).toEqual({ ok: true })
        expect(validateResultTime(86400)).toEqual({ ok: true })
        expect(validateResultTime(0)).toMatchObject({ ok: false, field: 'resultTimeS' })
        expect(validateResultTime(86401)).toMatchObject({ ok: false })
        expect(validateResultTime(5.5)).toMatchObject({ ok: false })
    })
})
