import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'
import { normalizeWebsiteUrl } from '@/_bff/core/utils/url.utils'

export const ClientEnv = createEnv({
    client: {
        // Absolute: OAuth redirect_uri and server redirects are built from it.
        NEXT_PUBLIC_WEBSITE_URL: z.url(),
    },
    runtimeEnv: {
        // Read literally so Next.js inlines it. An empty value copied from .env.example reads as unset.
        NEXT_PUBLIC_WEBSITE_URL: normalizeWebsiteUrl(
            process.env.NEXT_PUBLIC_WEBSITE_URL || undefined
        ),
    },
})
