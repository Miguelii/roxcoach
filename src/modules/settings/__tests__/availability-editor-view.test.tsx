import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { AvailabilitySlotDTO } from '@/_bff/modules/athlete/types'
import { AvailabilityEditorView } from '@/modules/settings/availability-editor-view'

const SLOTS: AvailabilitySlotDTO[] = [
    { weekday: 1, sessionKind: 'run', isFixed: false, maxMinutes: 60, notes: null },
    { weekday: 1, sessionKind: 'strength', isFixed: true, maxMinutes: 60, notes: null },
    { weekday: 7, sessionKind: 'rest', isFixed: false, maxMinutes: null, notes: null },
]

describe('AvailabilityEditorView', () => {
    it('renders the seven days, chips and the summary', () => {
        render(
            <AvailabilityEditorView
                slots={SLOTS}
                onChange={vi.fn()}
                onSave={vi.fn()}
                saving={false}
            />
        )
        for (let day = 1; day <= 7; day += 1)
            expect(screen.getByTestId(`availability-day-${day}`)).toBeInTheDocument()
        expect(screen.getByTestId('availability-slot-1-run')).toBeInTheDocument()
        expect(screen.getByTestId('availability-slot-1-strength')).toBeInTheDocument()
        expect(screen.getByTestId('availability-slot-7-rest')).toBeInTheDocument()
        expect(screen.getByTestId('availability-summary')).toHaveTextContent(
            '2 sessions per week, up to 2 h'
        )
    })

    it('removing a chip calls onChange without it', () => {
        const onChange = vi.fn()
        render(
            <AvailabilityEditorView
                slots={SLOTS}
                onChange={onChange}
                onSave={vi.fn()}
                saving={false}
            />
        )
        fireEvent.click(screen.getByTestId('availability-remove-1-run'))
        expect(onChange).toHaveBeenCalledWith([SLOTS[1], SLOTS[2]])
    })

    it('adding from the day menu calls onChange with the new slot', async () => {
        const onChange = vi.fn()
        render(
            <AvailabilityEditorView
                slots={[]}
                onChange={onChange}
                onSave={vi.fn()}
                saving={false}
            />
        )
        fireEvent.click(screen.getByTestId('availability-add-2'))
        fireEvent.click(await screen.findByTestId('availability-add-2-open-run'))
        expect(onChange).toHaveBeenCalledWith([
            { weekday: 2, sessionKind: 'run', isFixed: false, maxMinutes: null, notes: null },
        ])
    })

    it('shows the empty state for an empty week', () => {
        render(
            <AvailabilityEditorView slots={[]} onChange={vi.fn()} onSave={vi.fn()} saving={false} />
        )
        expect(screen.getByTestId('availability-empty')).toBeInTheDocument()
        expect(screen.getByTestId('availability-summary')).toHaveTextContent('0 sessions per week')
    })

    it('save calls onSave and is disabled while saving', () => {
        const onSave = vi.fn()
        const { rerender } = render(
            <AvailabilityEditorView
                slots={SLOTS}
                onChange={vi.fn()}
                onSave={onSave}
                saving={false}
            />
        )
        fireEvent.click(screen.getByTestId('availability-save'))
        expect(onSave).toHaveBeenCalledTimes(1)
        rerender(<AvailabilityEditorView slots={SLOTS} onChange={vi.fn()} onSave={onSave} saving />)
        expect(screen.getByTestId('availability-save')).toBeDisabled()
    })
})
