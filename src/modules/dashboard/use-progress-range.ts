'use client'

import { parseAsStringLiteral, useQueryState } from 'nuqs'
import { DEFAULT_PROGRESS_RANGE, PROGRESS_RANGES } from '@/_bff/core/constants/progress.constants'

// The range lives in the URL (`range`), so a refresh restores it. It is not saved in the profile.
export function useProgressRange() {
    const [range, setRange] = useQueryState(
        'range',
        parseAsStringLiteral(PROGRESS_RANGES)
            .withDefault(DEFAULT_PROGRESS_RANGE)
            .withOptions({ history: 'replace' })
    )
    return { range, setRange }
}
