import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { parseClock } from '@/_bff/core/utils/formatters.utils'
import { TODAY } from '@/modules/mock/data'

const formSchema = z.object({
    name: z.string().min(1, 'Required'),
    date: z
        .string()
        .min(1, 'Required')
        .refine((value) => value <= TODAY, 'Date cannot be in the future'),
    category: z.enum(['run', 'hyrox', 'strength', 'cross']),
    duration: z
        .string()
        .refine((value) => parseClock(value) !== null, 'Use h:mm:ss, mm:ss or minutes'),
    distanceKm: z
        .string()
        .refine((value) => value === '' || Number(value) >= 0, 'Invalid distance'),
    avgHr: z.string(),
    rpe: z
        .string()
        .refine((value) => value === '' || (Number(value) >= 1 && Number(value) <= 10), '1 to 10'),
    notes: z.string(),
})

export type LogSessionValues = z.infer<typeof formSchema>

export const useLogSessionForm = (date: string) =>
    useForm<LogSessionValues>({
        resolver: zodResolver(formSchema),
        values: {
            name: '',
            date,
            category: 'run',
            duration: '',
            distanceKm: '',
            avgHr: '',
            rpe: '',
            notes: '',
        },
    })
