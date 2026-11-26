// Live speech to text of the coach voice input. Shared by the token route (which locks the token to
// this model and config) and the browser (which sends the same setup over the socket).

export const TRANSCRIBE_LIVE_MODEL_ID = 'gemini-3.5-transcribe-live'

const LIVE_SOCKET_URL =
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

const LIVE_SAMPLE_RATE = 16_000

// 100 ms of audio at LIVE_SAMPLE_RATE, the chunk size the Live API docs recommend.
const LIVE_CHUNK_SAMPLES = 1600

// Time to open the session, then time to keep sending. The recording cap is 60 seconds.
const NEW_SESSION_WINDOW_MS = 60_000
const SESSION_WINDOW_MS = 180_000

export const LIVE_TRANSCRIBE_CONFIG = {
    generationConfig: { responseModalities: ['TEXT'] },
    inputAudioTranscription: { languageCodes: [], mode: 'SMART' },
}

export function liveSetupMessage() {
    return { setup: { model: `models/${TRANSCRIBE_LIVE_MODEL_ID}`, ...LIVE_TRANSCRIBE_CONFIG } }
}

export function liveSocketUrl(token: string) {
    return `${LIVE_SOCKET_URL}?access_token=${encodeURIComponent(token)}`
}

// One use and locked constraints, so a leaked token can only open one short transcription session.
export function liveTokenRequestBody(now: Date) {
    return {
        uses: 1,
        newSessionExpireTime: new Date(now.getTime() + NEW_SESSION_WINDOW_MS).toISOString(),
        expireTime: new Date(now.getTime() + SESSION_WINDOW_MS).toISOString(),
        liveConnectConstraints: { model: TRANSCRIBE_LIVE_MODEL_ID, config: LIVE_TRANSCRIBE_CONFIG },
    }
}
