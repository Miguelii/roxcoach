// Run with: pnpm dlx tsx --conditions=react-server tools/backfill-histograms.ts <user_id>
// Recomputes the HR and pace histograms of every activity of that user missing one, from the
// original files kept in Storage. Run it once after applying migration 0016. It is safe to rerun: only
// activities still without a histogram are touched. `--conditions=react-server` lets the
// server-only modules load outside Next. `main()` loads the Next env files itself and imports the
// app code only afterwards (importing this file loads nothing, so unit tests never read a real
// .env). Output is the counts and one line per failure with the activity id and error code only:
// never a path, a file name, file content or a key.

import { loadEnvConfig } from '@next/env'

type UserIdArg = { ok: true; userId: string } | { ok: false }

type BackfillSummary = {
    updated: number
    failed: number
    failures: { activityId: string; errorCode: string }[]
}

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu

// The only argument is the athlete's user id (a uuid), validated before anything is touched.
export function parseUserIdArg(arg: string | undefined): UserIdArg {
    return arg !== undefined && UUID_PATTERN.test(arg) ? { ok: true, userId: arg } : { ok: false }
}

export function formatBackfillOutput(summary: BackfillSummary): string[] {
    return [
        `updated: ${summary.updated}, failed: ${summary.failed}`,
        ...summary.failures.map((failure) => `failed ${failure.activityId}: ${failure.errorCode}`),
    ]
}

async function main() {
    const parsed = parseUserIdArg(process.argv[2])
    if (!parsed.ok) {
        console.log('Usage: backfill-histograms.ts <user_id> (the athlete user id, a uuid)')
        process.exitCode = 1
        return
    }
    loadEnvConfig(process.cwd())
    const { Effect } = await import('effect')
    const { createDBAdminClient } = await import('@/_bff/core/db')
    const { backfillHistograms } =
        await import('@/_bff/modules/training/services/backfill-histograms.service')

    const summary = await Effect.runPromise(
        backfillHistograms(createDBAdminClient(), parsed.userId)
    )
    for (const line of formatBackfillOutput(summary)) console.log(line)
    if (summary.failed > 0) process.exitCode = 1
}

if (process.argv[1]?.endsWith('backfill-histograms.ts')) void main()
