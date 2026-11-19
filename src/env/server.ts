import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const ServerEnv = createEnv({
    server: {
        NEXT_SUPABASE_URL: z.string(),
        NEXT_SUPABASE_PUBLISHABLE_KEY: z.string(),
        NEXT_SUPABASE_SERVICE_ROLE_KEY: z.string(),
        NEXT_ANTHROPIC_AI_KEY: z.string().optional(),
        NEXT_STRAVA_CLIENT_ID: z.string().optional(),
        NEXT_STRAVA_CLIENT_SECRET: z.string().optional(),
        NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
        NEXT_CRON_SECRET: z.string().optional(),
    },
    runtimeEnv: {
        NEXT_SUPABASE_URL: process.env.NEXT_SUPABASE_URL,
        NEXT_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_SUPABASE_PUBLISHABLE_KEY,
        NEXT_SUPABASE_SERVICE_ROLE_KEY: process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY,
        NEXT_ANTHROPIC_AI_KEY: process.env.NEXT_ANTHROPIC_AI_KEY,
        NEXT_STRAVA_CLIENT_ID: process.env.NEXT_STRAVA_CLIENT_ID,
        NEXT_STRAVA_CLIENT_SECRET: process.env.NEXT_STRAVA_CLIENT_SECRET,
        NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN: process.env.NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN,
        NEXT_CRON_SECRET: process.env.NEXT_CRON_SECRET,
    },
})
