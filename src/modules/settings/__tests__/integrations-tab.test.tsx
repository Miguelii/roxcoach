import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IntegrationsTab } from '@/modules/settings/integrations-tab'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

const pendingQuery = { data: undefined, isPending: true, isError: false, refetch: vi.fn() }
const idleMutation = { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false }

vi.mock('@/lib/trpc', () => import('@/lib/__mocks__/trpc'))
vi.mock('@tanstack/react-query', async (importOriginal) => {
    const { routeTrpc } = await import('@/lib/__mocks__/trpc-path')
    return {
        ...(await importOriginal<typeof import('@tanstack/react-query')>()),
        useQuery: (options: TrpcKeyed) =>
            routeTrpc(
                {
                    'lyfta.getConnectionStatus': () => pendingQuery,
                    'zepp.getConnectionStatus': () => pendingQuery,
                    'lyfta.getActivityCount': () => pendingQuery,
                    'zepp.getActivityCount': () => pendingQuery,
                },
                options
            ),
        useMutation: (options: TrpcKeyed) =>
            routeTrpc(
                {
                    'lyfta.connect': () => idleMutation,
                    'lyfta.syncWorkouts': () => idleMutation,
                    'lyfta.disconnect': () => idleMutation,
                    'zepp.connect': () => idleMutation,
                    'zepp.syncActivities': () => idleMutation,
                    'zepp.disconnect': () => idleMutation,
                    'lyfta.clearActivities': () => idleMutation,
                    'zepp.clearActivities': () => idleMutation,
                },
                options
            ),
        useQueryClient: () => ({ invalidateQueries: vi.fn() }),
    }
})

describe('IntegrationsTab', () => {
    it('has a heading and a card for Lyfta and Zepp', () => {
        render(<IntegrationsTab />)

        expect(screen.getByTestId('integrations-tab')).toBeInTheDocument()
        expect(screen.getByTestId('integrations-heading')).toHaveTextContent('Integrations')
        expect(screen.getByTestId('lyfta-loading')).toBeInTheDocument()
        expect(screen.getByTestId('zepp-loading')).toBeInTheDocument()
    })
})
