import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppLoader } from '@/components/app-loader'
import { AppShellSkeleton } from '@/components/app-shell-skeleton'

describe('AppLoader', () => {
    it('lists the eight Hyrox stations and starts on the first one', () => {
        render(<AppLoader />)

        const stations = screen.getAllByTestId('app-loader-station')
        expect(stations).toHaveLength(8)
        expect(stations[0]).toHaveTextContent('SkiErg')
        expect(stations[7]).toHaveTextContent('Wall balls')
    })

    it('is part of the shell skeleton', () => {
        render(<AppShellSkeleton />)

        expect(screen.getByTestId('app-loader')).toBeTruthy()
    })
})
