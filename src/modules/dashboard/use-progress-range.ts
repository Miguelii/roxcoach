'use client'

import { useQueryState } from 'nuqs'
import { PROGRESS_RANGE_PARSER } from '@/modules/dashboard/constants'

// The range lives in the URL (`range`), so a refresh restores it. It is not saved in the profile.
export function useProgressRange() {
    const [range, setRange] = useQueryState(
        'range',
        PROGRESS_RANGE_PARSER.withOptions({ history: 'replace' })
    )
    return { range, setRange }
}
