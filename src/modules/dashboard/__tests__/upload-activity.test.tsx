import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UploadActivity } from '@/modules/dashboard/upload-activity'

const mocks = vi.hoisted(() => ({
    refresh: vi.fn(),
    success: vi.fn(),
    invalidate: vi.fn(),
    handlers: new Array<() => void>(),
}))

// The real side effects live in this wiring component, so its hooks are the only mocked seams.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('sonner', () => ({ toast: { success: mocks.success } }))
vi.mock('@/lib/trpc', () => ({
    trpcClient: {
        useUtils: () => ({ training: { getCalendar: { invalidate: mocks.invalidate } } }),
    },
}))
vi.mock('@/modules/dashboard/upload-activity-drawer', () => ({
    UploadActivityDrawer: (props: { onUploaded?: () => void }) => {
        if (props.onUploaded) mocks.handlers.push(props.onUploaded)
        return <div data-testid="drawer" />
    },
}))

describe('UploadActivity', () => {
    it('toasts, refreshes and invalidates the calendar after an upload', () => {
        render(<UploadActivity />)
        expect(screen.getByTestId('drawer')).toBeInTheDocument()
        expect(mocks.invalidate).not.toHaveBeenCalled()
        mocks.handlers.at(-1)?.()
        expect(mocks.success).toHaveBeenCalledWith('Activity uploaded')
        expect(mocks.refresh).toHaveBeenCalled()
        expect(mocks.invalidate).toHaveBeenCalledTimes(1)
    })
})
