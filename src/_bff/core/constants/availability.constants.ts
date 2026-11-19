export const SESSION_KINDS = ['hyrox', 'run', 'strength', 'cross', 'rest'] as const

export type SessionKind = (typeof SESSION_KINDS)[number]
