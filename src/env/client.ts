import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'
import { normalizeWebsiteUrl } from '@/_bff/core/utils/url.utils'

export const ClientEnv = createEnv({
    client: {
        NEXT_PUBLIC_WEBSITE_URL: z.string(),
    },
    runtimeEnv: {
        NEXT_PUBLIC_WEBSITE_URL: normalizeWebsiteUrl(
            process?.env?.NEXT_PUBLIC_WEBSITE_URL ?? undefined
        ),
    },
})
