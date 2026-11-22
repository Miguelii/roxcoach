import { ErrorCode } from '@/_bff/lib/error-codes'

type ZeppUiError = { message: string }

export type ZeppSyncResult = {
    imported: number
    skipped: number
    updated: number
    remaining: number
}

const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
    [ErrorCode.ZEPP_LOGIN_REJECTED]: 'Zepp did not accept this email or password.',
    [ErrorCode.ZEPP_SESSION_EXPIRED]: 'Your Zepp session expired. Sign in again.',
    [ErrorCode.ZEPP_NO_CONNECTION]: 'Connect Zepp before syncing.',
    [ErrorCode.ZEPP_API_REQUEST]: 'Could not reach Zepp. Check your connection and try again.',
    [ErrorCode.ZEPP_API_RESPONSE]: 'Zepp could not complete the request. Try again later.',
    [ErrorCode.ZEPP_CONFIGURATION]: 'Zepp is not configured on the server. Contact support.',
    [ErrorCode.ZEPP_CONNECTION_WRITE]: 'Could not save your Zepp connection. Try again.',
    [ErrorCode.ZEPP_CONNECTION_QUERY]: 'Could not load your Zepp connection. Try again.',
    [ErrorCode.ZEPP_IMPORT]: 'Could not save imported runs. Try syncing again.',
    [ErrorCode.TRAINING_ZEPP_ACTIVITY_INSERT_ERR]:
        'Could not save imported runs. Try syncing again.',
    [ErrorCode.TRAINING_ZEPP_ACTIVITY_SELECT_ERR]:
        'Could not load your training history. Try syncing again.',
}

const GENERIC_ERROR_MESSAGE = 'Zepp could not complete the request. Try again.'

export const messageForZeppError = ({ message }: ZeppUiError): string => {
    const errorCode = Object.values(ErrorCode).find((code) => code === message)
    return (errorCode && ERROR_MESSAGES[errorCode]) || GENERIC_ERROR_MESSAGE
}

const runs = (count: number) => `${count} ${count === 1 ? 'run' : 'runs'}`

export const zeppSyncMessage = ({
    imported,
    skipped,
    updated,
    remaining,
}: ZeppSyncResult): string => {
    if (imported === 0 && skipped === 0 && updated === 0 && remaining === 0) return 'No new runs.'
    const parts: string[] = []
    if (imported > 0 || updated === 0) parts.push(`Imported ${runs(imported)}.`)
    if (updated > 0) parts.push(`Added splits to ${runs(updated)}.`)
    if (skipped > 0) parts.push(`${skipped} already in Roxcoach.`)
    if (remaining > 0) parts.push('More runs to sync. Press Sync again to continue.')
    return parts.join(' ')
}
