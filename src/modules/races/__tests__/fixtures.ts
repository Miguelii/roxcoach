import type { RaceDTO } from '@/_bff/modules/races/types'

export const TODAY = '2026-11-20'

export const HYROX_RACE: RaceDTO = {
    id: 'r-hyrox',
    name: 'Hyrox Lisbon',
    raceType: 'hyrox',
    raceDate: '2027-01-01',
    location: 'Lisbon',
    distanceM: null,
    hyroxDivision: 'open_men',
    targetTimeS: 4200,
    priority: 'A',
    status: 'upcoming',
    resultTimeS: null,
    notes: 'Bring grips',
}

export const RUN_RACE: RaceDTO = {
    id: 'r-run',
    name: 'Sao Silvestre',
    raceType: 'running',
    raceDate: '2026-12-31',
    location: null,
    distanceM: 10000,
    hyroxDivision: null,
    targetTimeS: 2400,
    priority: 'B',
    status: 'upcoming',
    resultTimeS: null,
    notes: null,
}

export const DONE_RACE: RaceDTO = {
    ...RUN_RACE,
    id: 'r-done',
    name: 'Old 10k',
    raceDate: '2026-05-01',
    status: 'completed',
    resultTimeS: 2502,
}

export const CANCELLED_RACE: RaceDTO = {
    ...HYROX_RACE,
    id: 'r-cancelled',
    name: 'Cancelled Hyrox',
    raceDate: '2026-09-01',
    status: 'cancelled',
}
