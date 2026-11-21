import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { HyroxDivision } from '@/_bff/core/constants/hyrox.constants'
import type { RaceDTO } from '@/_bff/modules/races/types'
import type { ProfileDTO } from '@/_bff/modules/athlete/types'
import { HYROX_RACE } from '@/modules/races/__tests__/fixtures'
import { RacesView } from '@/modules/races/races-view'

type QueryState<Data> = {
    data: Data | undefined
    isPending: boolean
    isError: boolean
    isFetching: boolean
    refetch: () => Promise<void>
}

type RacesManagerProps = {
    races: RaceDTO[]
    today: string
    defaultDivision: HyroxDivision | null
}

const mocks = vi.hoisted(() => {
    const timezone: QueryState<string> = {
        data: 'UTC',
        isPending: false,
        isError: false,
        isFetching: false,
        refetch: () => Promise.resolve(),
    }
    const profile: QueryState<ProfileDTO> = {
        data: {
            displayName: '',
            timezone: 'UTC',
            maxHr: null,
            restingHr: null,
            hyroxDivision: 'open_men',
            weeklyHoursCap: null,
            notes: null,
            dashboardMode: 'run',
        },
        isPending: false,
        isError: false,
        isFetching: false,
        refetch: () => Promise.resolve(),
    }
    const races: QueryState<RaceDTO[]> = {
        data: [],
        isPending: false,
        isError: false,
        isFetching: false,
        refetch: () => Promise.resolve(),
    }
    return { timezone, profile, races }
})

vi.mock('@/lib/trpc', () => ({
    trpcClient: {
        athlete: {
            getTimezone: { useQuery: () => mocks.timezone },
            getProfile: { useQuery: () => mocks.profile },
        },
        races: {
            list: { useQuery: () => mocks.races },
        },
    },
}))

vi.mock('@/modules/races/races-manager', () => ({
    RacesManager: ({ races, today, defaultDivision }: RacesManagerProps) => (
        <div
            data-testid="races-manager"
            data-race-count={races.length}
            data-today={today}
            data-default-division={defaultDivision ?? ''}
        />
    ),
}))

describe('RacesView', () => {
    beforeEach(() => {
        mocks.timezone.data = 'UTC'
        mocks.timezone.isPending = false
        mocks.timezone.isError = false
        mocks.timezone.isFetching = false
        mocks.profile.data = {
            displayName: '',
            timezone: 'UTC',
            maxHr: null,
            restingHr: null,
            hyroxDivision: 'open_men',
            weeklyHoursCap: null,
            notes: null,
            dashboardMode: 'run',
        }
        mocks.profile.isPending = false
        mocks.profile.isError = false
        mocks.profile.isFetching = false
        mocks.races.data = [HYROX_RACE]
        mocks.races.isPending = false
        mocks.races.isError = false
        mocks.races.isFetching = false
    })

    it('keeps cached races visible during a background refetch', () => {
        mocks.timezone.isFetching = true
        mocks.profile.isFetching = true
        mocks.races.isFetching = true

        render(<RacesView />)

        const manager = screen.getByTestId('races-manager')
        expect(manager.dataset.raceCount).toBe('1')
        expect(manager.dataset.defaultDivision).toBe('open_men')
        expect(screen.queryByTestId('races-loading')).toBeNull()
    })

    it('shows the loading skeleton before the first query results arrive', () => {
        mocks.timezone.data = undefined
        mocks.timezone.isPending = true
        mocks.profile.data = undefined
        mocks.profile.isPending = true
        mocks.races.data = undefined
        mocks.races.isPending = true

        render(<RacesView />)

        expect(screen.getByTestId('races-loading')).toBeInTheDocument()
    })
})
