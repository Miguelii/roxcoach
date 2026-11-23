import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const ServerEnv = createEnv({
    server: {
        NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
        NEXT_SUPABASE_URL: z.string().min(1),
        NEXT_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
        NEXT_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
        NEXT_GEMINI_API_KEY: z.string().optional(),
        // Shared access code of the /signup page. Unset closes sign-up.
        NEXT_SIGNUP_ACCESS_CODE: z.string().min(1).optional(),
        NEXT_LYFTA_ENCRYPTION_KEY: z
            .string()
            .refine((value) => {
                const decoded = Buffer.from(value, 'base64')
                return decoded.byteLength === 32 && decoded.toString('base64') === value
            }, 'Must be canonical Base64 encoding of exactly 32 bytes')
            .optional(),
        NEXT_ZEPP_ENCRYPTION_KEY: z
            .string()
            .refine((value) => {
                const decoded = Buffer.from(value, 'base64')
                return decoded.byteLength === 32 && decoded.toString('base64') === value
            }, 'Must be canonical Base64 encoding of exactly 32 bytes')
            .optional(),
        // Identifies the deployed build (the install prompt is offered again after a new one).
        NEXT_BUILD_ID: z.string().min(1).optional(),
        // Trigger.dev secret key of the environment the start services enqueue runs in.
        TRIGGER_SECRET_KEY: z.string().min(1).optional(),
    },
    runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_SUPABASE_URL: process.env.NEXT_SUPABASE_URL,
        NEXT_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_SUPABASE_PUBLISHABLE_KEY,
        NEXT_SUPABASE_SERVICE_ROLE_KEY: process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY,
        NEXT_GEMINI_API_KEY: process.env.NEXT_GEMINI_API_KEY,
        NEXT_SIGNUP_ACCESS_CODE: process.env.NEXT_SIGNUP_ACCESS_CODE,
        NEXT_LYFTA_ENCRYPTION_KEY: process.env.NEXT_LYFTA_ENCRYPTION_KEY,
        // Intentional: Zepp tokens are encrypted with the same key as Lyfta, read from its variable.
        NEXT_ZEPP_ENCRYPTION_KEY: process.env.NEXT_LYFTA_ENCRYPTION_KEY,
        // Vercel sets the commit of every deployment; NEXT_BUILD_ID overrides it elsewhere.
        NEXT_BUILD_ID: process.env.NEXT_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA,
        TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY,
    },
    // An empty value copied from .env.example reads as unset.
    emptyStringAsUndefined: true,
})
