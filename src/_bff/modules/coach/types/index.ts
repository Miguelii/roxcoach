import type { z } from 'zod'
import type { User } from '@supabase/supabase-js'
import type { AvailabilitySlotDTO, ProfileDTO } from '@/_bff/modules/athlete/types'
import type { RaceDTO, RaceFilter } from '@/_bff/modules/races/types'
import type {
    ActivityDTO,
    CalendarItem,
    LapDTO,
    StrengthSetDTO,
} from '@/_bff/modules/training/types'

export type ConversationDTO = {
    id: string
    // Null until the first exchange names the conversation.
    title: string | null
    updatedAt: string
}

type MessageRole = 'user' | 'assistant'

export type MessageDTO = {
    id: string
    role: MessageRole
    content: string
    // The model that wrote an assistant reply. Null for user messages and for any row without a model; older replies hold the id that was configured then.
    model: string | null
    createdAt: string
}

// A message to store. Model and token counts only exist on assistant replies.
export type MessageInput = {
    conversationId: string
    role: MessageRole
    content: string
    model?: string | null
    promptTokens?: number | null
    completionTokens?: number | null
}

export type CoachContextInput = {
    // Plain `YYYY-MM-DD` in the athlete's timezone.
    today: string
    timezone: string
    profile: ProfileDTO | null
    availability: AvailabilitySlotDTO[]
    races: RaceDTO[]
    // Activities of the last 35 days.
    activities: ActivityDTO[]
}

// The result is plain JSON data.
export type ToolResult = object

export type CoachTool = {
    name: string
    description: string
    inputSchema: z.ZodType
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- validated by the tool's zod schema
    execute: (input: unknown) => Promise<ToolResult>
}

// The reads the tools need, as promises. Tests pass fakes; the default runs the real services.
export type CoachToolDeps = {
    listRaces: (user: User, filter: RaceFilter) => Promise<RaceDTO[]>
    getAvailability: (user: User) => Promise<AvailabilitySlotDTO[]>
    getActivityCalendar: (
        user: User,
        range: { from: string; to: string }
    ) => Promise<CalendarItem[]>
    getActivity: (
        user: User,
        id: string
    ) => Promise<{ activity: ActivityDTO; laps: LapDTO[]; strengthSets: StrengthSetDTO[] } | null>
}
