import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { parseClock } from '@/_bff/core/utils/formatters.utils'
import { TODAY } from '@/modules/mock/data'

const formSchema = z
    .object({
        name: z.string().min(1, 'Required'),
        type: z.enum(['hyrox', 'running']),
        date: z
            .string()
            .min(1, 'Required')
            .refine((value) => value > TODAY, 'Pick a future date'),
        location: z.string(),
        distanceKm: z.string(),
        division: z.string(),
        target: z
            .string()
            .refine((value) => parseClock(value) !== null, 'Use h:mm:ss, for example 1:10:00'),
        priority: z.enum(['A', 'B', 'C']),
    })
    .refine((values) => values.type !== 'running' || Number(values.distanceKm) > 0, {
        path: ['distanceKm'],
        message: 'Distance is required for running races',
    })

export type RaceFormValues = z.infer<typeof formSchema>

export const useRaceForm = () =>
    useForm<RaceFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            type: 'hyrox',
            date: '',
            location: '',
            distanceKm: '',
            division: 'Open, men',
            target: '',
            priority: 'A',
        },
    })
