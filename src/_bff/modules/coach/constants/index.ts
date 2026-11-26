// Size cap of the always-sent context block (about 3000 tokens).
export const CONTEXT_MAX_CHARS = 12000

// Latest messages of a conversation returned by the API.
export const MESSAGES_RETURNED = 200

// Latest conversations returned by the API.
export const CONVERSATIONS_RETURNED = 30

// Longest message an athlete can send.
export const MESSAGE_MAX_CHARS = 2000

// User messages an athlete can send per local day.
export const DAILY_MESSAGE_CAP = 50

// Messages of the conversation sent to the model, including the new one.
export const HISTORY_WINDOW = 20

// Model steps per reply (tool rounds included).
export const MAX_STEPS = 5

// Time after which the model fallback chain starts no further model (route limit is 60 s).
export const FALLBACK_DEADLINE_MS = 45_000

// Time a model gets to emit its first event before the fallback chain moves to the next one.
export const FIRST_EVENT_TIMEOUT_MS = 15_000

// A conversation is titled with the start of its first message.
export const TITLE_MAX_CHARS = 60

// Strength sets of one activity returned to the model by the getActivity tool.
export const ACTIVITY_SETS_RETURNED = 200

// Largest voice clip accepted. 60 seconds of browser audio is well under 1 MB.
export const AUDIO_MAX_BYTES = 2 * 1024 * 1024

// Container types browsers record in, compared without codec parameters.
export const AUDIO_MIME_TYPES = [
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/mpeg',
    'audio/wav',
] as const

// Speech to text model of the coach voice input.
export const TRANSCRIBE_MODEL_ID = 'gemini-3.5-transcribe'

export const TRANSCRIBE_TIMEOUT_MS = 30_000
