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

// A conversation is titled with the start of its first message.
export const TITLE_MAX_CHARS = 60

// Strength sets of one activity returned to the model by the getActivity tool.
export const ACTIVITY_SETS_RETURNED = 200

// Provisional: used only when NEXT_COACH_MODEL is unset. Verify against Google's current model list.
export const DEFAULT_COACH_MODEL = 'gemini-2.5-flash'
