import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const ServerEnv = createEnv({
    server: {
        NEXT_SUPABASE_URL: z.string().min(1),
        NEXT_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
        NEXT_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
        NEXT_ANTHROPIC_AI_KEY: z.string().optional(),
        NEXT_CRON_SECRET: z.string().optional(),
        TRIGGER_SECRET_KEY: z.string().optional(),
    },
    runtimeEnv: {
        NEXT_SUPABASE_URL: process.env.NEXT_SUPABASE_URL,
        NEXT_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_SUPABASE_PUBLISHABLE_KEY,
        NEXT_SUPABASE_SERVICE_ROLE_KEY: process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY,
        NEXT_ANTHROPIC_AI_KEY: process.env.NEXT_ANTHROPIC_AI_KEY,
        NEXT_CRON_SECRET: process.env.NEXT_CRON_SECRET,
        TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY,
    },
    // An empty value copied from .env.example reads as unset.
    emptyStringAsUndefined: true,
})
