import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

const loginSchema = z.object({
    email: z.email('Enter a valid email'),
    password: z.string().min(1, 'Enter your password'),
})

export type LoginValues = z.infer<typeof loginSchema>

export const useLoginForm = () =>
    useForm<LoginValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: '', password: '' },
    })
