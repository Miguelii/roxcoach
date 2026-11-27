'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

type Props = {
    error: unknown
}

// Fixed copy only: the error message is never shown.
export default function RacesError(_props: Props) {
    useEffect(() => {
        toast.error('Could not load your races. Please try again.', { id: 'races-error' })
    }, [])

    return null
}
