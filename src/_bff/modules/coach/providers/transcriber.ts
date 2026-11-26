type TranscribeInput = { bytes: Uint8Array; mimeType: string }

export type TranscribeOutcome =
    | { ok: true; text: string }
    | { ok: false; kind: 'rate_limited' | 'unavailable' }

export type Transcriber = (
    input: TranscribeInput,
    signal: AbortSignal
) => Promise<TranscribeOutcome>
