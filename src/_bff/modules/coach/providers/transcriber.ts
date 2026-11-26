type TranscribeInput = { bytes: Uint8Array; mimeType: string }

export type TranscribeOutcome =
    | { ok: true; text: string }
    // `reason` is for logs only (an HTTP status, `timeout`, `parse`, an interaction status), never shown.
    | { ok: false; kind: 'rate_limited' | 'unavailable'; reason: string }

export type Transcriber = (
    input: TranscribeInput,
    signal: AbortSignal
) => Promise<TranscribeOutcome>
