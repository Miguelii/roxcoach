import { LYFTA_SYNC_IN_PROGRESS_MESSAGE } from '@/_bff/core/constants/lyfta.constants'
import { ErrorCode } from '@/_bff/lib/error-codes'

type LyftaUiError = {
    message: string
}

const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
    [ErrorCode.LYFTA_CREDENTIAL]: 'Lyfta did not accept this API key. Check it and try again.',
    [ErrorCode.LYFTA_RATE_LIMIT]: 'Lyfta is rate limiting requests. Wait before trying again.',
    [ErrorCode.LYFTA_API_REQUEST]: 'Could not reach Lyfta. Check your connection and try again.',
    [ErrorCode.LYFTA_API_RESPONSE]: 'Lyfta could not complete the request. Try again later.',
    [ErrorCode.LYFTA_CONNECTION_WRITE]: 'Could not save your Lyfta connection. Try again.',
    [ErrorCode.LYFTA_CONNECTION_QUERY]: 'Could not load your Lyfta connection. Try again.',
    [ErrorCode.LYFTA_CHECKPOINT]: 'Could not save the sync time. Try syncing again.',
    [ErrorCode.LYFTA_CONFIGURATION]: 'Lyfta is not configured on the server. Contact support.',
    [ErrorCode.LYFTA_NO_CONNECTION]: 'Connect Lyfta before syncing workouts.',
    [ErrorCode.LYFTA_IMPORT]: 'Could not save imported workouts. Try syncing again.',
    [ErrorCode.TRAINING_LYFTA_ACTIVITY_SELECT_ERR]:
        'Could not load your training history. Try syncing again.',
    [ErrorCode.TRAINING_LYFTA_ACTIVITY_UPSERT_ERR]:
        'Could not save imported workouts. Try syncing again.',
    [ErrorCode.TRAINING_STRENGTH_SETS_DELETE_ERR]:
        'Could not replace imported sets. Try syncing again.',
    [ErrorCode.TRAINING_STRENGTH_SETS_INSERT_ERR]:
        'Could not save imported sets. Try syncing again.',
}

export const LYFTA_MORE_TO_SYNC_MESSAGE =
    'More workouts to sync. Press Sync workouts again to continue.'

const GENERIC_ERROR_MESSAGE = 'Lyfta could not complete the request. Try again.'

export const messageForLyftaError = ({ message }: LyftaUiError): string => {
    if (message === LYFTA_SYNC_IN_PROGRESS_MESSAGE) return message
    const errorCode = Object.values(ErrorCode).find((code) => code === message)
    return (errorCode && ERROR_MESSAGES[errorCode]) || GENERIC_ERROR_MESSAGE
}

export const formatLyftaTimestamp = (value: string): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Unknown'
    return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
