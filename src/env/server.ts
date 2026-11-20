import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const ServerEnv = createEnv({
    server: {
        NEXT_SUPABASE_URL: z.string().min(1),
        NEXT_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
        NEXT_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
        NEXT_GEMINI_API_KEY: z.string().optional(),
        NEXT_COACH_MODEL: z.string().optional(),
    },
    runtimeEnv: {
        NEXT_SUPABASE_URL: process.env.NEXT_SUPABASE_URL,
        NEXT_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_SUPABASE_PUBLISHABLE_KEY,
        NEXT_SUPABASE_SERVICE_ROLE_KEY: process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY,
        NEXT_GEMINI_API_KEY: process.env.NEXT_GEMINI_API_KEY,
        NEXT_COACH_MODEL: process.env.NEXT_COACH_MODEL,
    },
    // An empty value copied from .env.example reads as unset.
    emptyStringAsUndefined: true,
})
