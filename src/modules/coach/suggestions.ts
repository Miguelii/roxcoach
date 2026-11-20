export const COACH_SUGGESTIONS = [
    'How is my training going?',
    'Am I on track for my next race?',
    'What should I do this week?',
] as const

// Mirrors the server limit (the route answers 422 above it).
export const COACH_MESSAGE_MAX_CHARS = 2000
