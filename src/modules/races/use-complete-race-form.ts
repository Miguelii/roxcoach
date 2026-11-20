import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { parseRaceClock } from '@/modules/races/utils'

const completeSchema = z.object({
    resultTime: z.string().refine((value) => {
        const seconds = parseRaceClock(value)
        return seconds !== null && seconds >= 1 && seconds <= 86400
    }, 'Enter your time such as 1:12:30 (up to 24 hours)'),
})

export type CompleteRaceValues = z.infer<typeof completeSchema>

// Seconds for the typed result, or null when it is not a valid time.
export const parseResultTime = (text: string) => {
    const seconds = parseRaceClock(text)
    return seconds !== null && seconds >= 1 && seconds <= 86400 ? seconds : null
}

export const useCompleteRaceForm = () =>
    useForm<CompleteRaceValues>({
        resolver: zodResolver(completeSchema),
        defaultValues: { resultTime: '' },
    })
