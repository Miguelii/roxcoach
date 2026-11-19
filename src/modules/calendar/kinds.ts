import {
    IconActivityHeartbeat,
    IconBarbell,
    IconFlame,
    IconRun,
    type Icon,
} from '@tabler/icons-react'
import type { Category } from '@/modules/mock/types'

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
}

export const CATEGORIES: Category[] = ['run', 'hyrox', 'strength', 'cross']
