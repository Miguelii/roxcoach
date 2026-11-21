import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

// bcrypt ignores everything after 72 bytes, so the server rejects longer passwords.
const signupSchema = z.object({
    displayName: z.string().trim().min(1, 'Enter your name').max(60, 'Use at most 60 characters'),
    email: z.email('Enter a valid email'),
    password: z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters'),
    accessCode: z.string().min(1, 'Enter your access code'),
})

export type SignupValues = z.infer<typeof signupSchema>

export const useSignupForm = () =>
    useForm<SignupValues>({
        resolver: zodResolver(signupSchema),
        defaultValues: { displayName: '', email: '', password: '', accessCode: '' },
    })
