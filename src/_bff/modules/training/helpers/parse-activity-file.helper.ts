import { Effect } from 'effect'
import { ActivityFileParseError, UnsupportedActivityFileError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { detectActivityFormat } from '@/_bff/modules/training/helpers/detect-activity-format.helper'
import type { ParsedActivity } from '@/_bff/modules/training/types'
import { parseFit } from '@/_bff/modules/training/helpers/parse-fit.helper'
import { parseGpx } from '@/_bff/modules/training/helpers/parse-gpx.helper'
import { parseTcx } from '@/_bff/modules/training/helpers/parse-tcx.helper'

export function parseActivityFile(
    bytes: Uint8Array
): Effect.Effect<ParsedActivity, UnsupportedActivityFileError | ActivityFileParseError> {
    const format = detectActivityFormat(bytes)
    if (format === 'fit') return parseFit(bytes)
    if (format === 'tcx') return parseTcx(bytes)
    if (format === 'gpx') return parseGpx(bytes)
    return Effect.fail(
        new UnsupportedActivityFileError({
            cause: format ?? 'unknown format',
            error_hash: ErrorCode.TRAINING_FILE_UNSUPPORTED,
        })
    )
}
