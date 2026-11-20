type CoachModelEntry = { id: string; label: string }

// Ordered best first. Position 0 is tried first by the coach fallback chain.
export const COACH_MODELS: ReadonlyArray<CoachModelEntry> = [
    { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
]

// Friendly name of a listed model id, otherwise the raw id.
export function coachModelLabel(id: string): string {
    return COACH_MODELS.find((model) => model.id === id)?.label ?? id
}
