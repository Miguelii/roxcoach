import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const ServerEnv = createEnv({
    server: {
        NEXT_SUPABASE_URL: z.string().min(1),
        NEXT_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
        NEXT_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
        NEXT_GEMINI_API_KEY: z.string().optional(),
        // Shared access code of the /signup page. Unset closes sign-up.
        NEXT_SIGNUP_ACCESS_CODE: z.string().min(16).optional(),
        NEXT_LYFTA_ENCRYPTION_KEY: z
            .string()
            .refine((value) => {
                const decoded = Buffer.from(value, 'base64')
                return decoded.byteLength === 32 && decoded.toString('base64') === value
            }, 'Must be canonical Base64 encoding of exactly 32 bytes')
            .optional(),
    },
    runtimeEnv: {
        NEXT_SUPABASE_URL: process.env.NEXT_SUPABASE_URL,
        NEXT_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_SUPABASE_PUBLISHABLE_KEY,
        NEXT_SUPABASE_SERVICE_ROLE_KEY: process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY,
        NEXT_GEMINI_API_KEY: process.env.NEXT_GEMINI_API_KEY,
        NEXT_SIGNUP_ACCESS_CODE: process.env.NEXT_SIGNUP_ACCESS_CODE,
        NEXT_LYFTA_ENCRYPTION_KEY: process.env.NEXT_LYFTA_ENCRYPTION_KEY,
    },
    // An empty value copied from .env.example reads as unset.
    emptyStringAsUndefined: true,
})
