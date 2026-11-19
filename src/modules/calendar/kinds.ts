import {
    IconActivity,
    IconActivityHeartbeat,
    IconBarbell,
    IconFlame,
    IconRun,
    type Icon,
} from '@tabler/icons-react'
import type { ActivityDTO } from '@/_bff/modules/training/types'

type Category = ActivityDTO['category']

type Tone = 'blue' | 'tangerine' | 'navy' | 'slate'

type KindConfig = {
    label: string
    tone: Tone
    Icon: Icon
}

/** Color and icon per training category. Color is never the only carrier of meaning. */
export const KINDS: Record<Category, KindConfig> = {
    run: { label: 'Run', tone: 'blue', Icon: IconRun },
    hyrox: { label: 'Hyrox', tone: 'tangerine', Icon: IconFlame },
    strength: { label: 'Strength', tone: 'navy', Icon: IconBarbell },
    cross: { label: 'Cross', tone: 'slate', Icon: IconActivityHeartbeat },
    other: { label: 'Other', tone: 'slate', Icon: IconActivity },
}

export const CATEGORIES: Category[] = ['run', 'hyrox', 'strength', 'cross', 'other']
