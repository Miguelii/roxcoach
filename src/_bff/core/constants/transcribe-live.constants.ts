// Live speech to text of the coach voice input. Shared by the token route (which locks the token to
// this model and config) and the browser (which sends the same setup over the socket).

const TRANSCRIBE_LIVE_MODEL_ID = 'gemini-3.5-transcribe-live'

const LIVE_SOCKET_URL =
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained'

export const LIVE_SAMPLE_RATE = 16_000

// 100 ms of audio at LIVE_SAMPLE_RATE, the chunk size the Live API docs recommend.
export const LIVE_CHUNK_SAMPLES = 1600

// Time to open the session, then time to keep sending: the Live API's 10 minute session limit, so a
// paused recording (the cap counts recorded time only) does not outlive its token.
const NEW_SESSION_WINDOW_MS = 60_000
const SESSION_WINDOW_MS = 600_000

export function liveSetupMessage() {
    return {
        setup: {
            model: `models/${TRANSCRIBE_LIVE_MODEL_ID}`,
            generationConfig: { responseModalities: ['TEXT'] },
            inputAudioTranscription: { languageCodes: [], mode: 'SMART' },
        },
    }
}

export function liveSocketUrl(token: string) {
    return `${LIVE_SOCKET_URL}?access_token=${encodeURIComponent(token)}`
}

// One use and locked to our setup, so a leaked token can only open one short transcription session.
// The REST field is `bidiGenerateContentSetup` holding the same setup the socket sends (the SDK's
// `liveConnectConstraints` is only its client-side name; the API rejects it with a 400).
export function liveTokenRequestBody(now: Date) {
    return {
        uses: 1,
        newSessionExpireTime: new Date(now.getTime() + NEW_SESSION_WINDOW_MS).toISOString(),
        expireTime: new Date(now.getTime() + SESSION_WINDOW_MS).toISOString(),
        bidiGenerateContentSetup: liveSetupMessage().setup,
    }
}
