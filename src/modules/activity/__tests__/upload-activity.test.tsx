import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UploadActivity } from '@/modules/activity/upload-activity'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

const mocks = vi.hoisted(() => ({
    success: vi.fn(),
    invalidate: vi.fn(),
    invalidateRun: vi.fn(),
    invalidateStrength: vi.fn(),
    handlers: new Array<() => void>(),
}))

// The real side effects live in this wiring component, so its hooks are the only mocked seams.
vi.mock('sonner', () => ({ toast: { success: mocks.success } }))
vi.mock('@/lib/trpc', () => import('@/lib/__mocks__/trpc'))
vi.mock('@tanstack/react-query', async (importOriginal) => {
    const { routeTrpc } = await import('@/lib/__mocks__/trpc-path')
    return {
        ...(await importOriginal<typeof import('@tanstack/react-query')>()),
        useQueryClient: () => ({
            invalidateQueries: (filter: TrpcKeyed) =>
                routeTrpc(
                    {
                        'training.getCalendar': mocks.invalidate,
                        'training.getRunProgress': mocks.invalidateRun,
                        'training.getStrengthProgress': mocks.invalidateStrength,
                    },
                    filter
                ),
        }),
    }
})
vi.mock('@/modules/dashboard/upload-activity-drawer', () => ({
    UploadActivityDrawer: (props: { onUploaded?: () => void }) => {
        if (props.onUploaded) mocks.handlers.push(props.onUploaded)
        return <div data-testid="drawer" />
    },
}))

describe('UploadActivity', () => {
    it('toasts and invalidates the calendar and both progress queries after an upload', () => {
        render(<UploadActivity />)
        expect(screen.getByTestId('drawer')).toBeInTheDocument()
        expect(mocks.invalidate).not.toHaveBeenCalled()
        mocks.handlers.at(-1)?.()
        expect(mocks.success).toHaveBeenCalledWith('Activity uploaded')
        expect(mocks.invalidate).toHaveBeenCalledTimes(1)
        expect(mocks.invalidateRun).toHaveBeenCalledTimes(1)
        expect(mocks.invalidateStrength).toHaveBeenCalledTimes(1)
    })
})
