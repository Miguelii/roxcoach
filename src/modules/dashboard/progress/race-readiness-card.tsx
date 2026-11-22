import {
    IconAlertTriangle,
    IconCircleCheck,
    IconCircleDashed,
    IconLeaf,
    type Icon,
} from '@tabler/icons-react'
import { RACE_READINESS } from '@/_bff/core/constants/race-readiness.constants'
import type { ReadinessState, RunReadinessDTO } from '@/_bff/modules/training/types/progress'
import { cn } from '@/lib/utils'
import { loadReason, paceReason, stateLabel } from '@/modules/dashboard/progress/readiness-utils'

type Props = {
    readiness: RunReadinessDTO
}

type RowProps = {
    id: 'load' | 'pace'
    title: string
    state: ReadinessState
    reason: string
    // Optional glance under the reason, e.g. the fast sessions filled so far.
    glance?: React.ReactNode
}

const STATE_STYLES: Record<ReadinessState, { Icon: Icon; tone: string }> = {
    on_track: { Icon: IconCircleCheck, tone: 'green' },
    attention: { Icon: IconAlertTriangle, tone: 'amber' },
    no_data: { Icon: IconCircleDashed, tone: 'slate' },
    taper: { Icon: IconLeaf, tone: 'blue' },
}

function ReadinessRow({ id, title, state, reason, glance }: RowProps) {
    const { Icon, tone } = STATE_STYLES[state]

    return (
        <div className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 md:flex-row md:items-start md:gap-6">
            <div className="flex items-center justify-between gap-3 md:w-56 md:shrink-0">
                <h3 className="display text-xl">{title}</h3>
                <span
                    data-tone={tone}
                    data-testid={`readiness-${id}-state`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-tone-soft px-2.5 py-1 text-xs font-medium text-tone-deep"
                >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {stateLabel(state)}
                </span>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
                <p data-testid={`readiness-${id}-reason`} className="text-sm text-muted-foreground">
                    {reason}
                </p>
                {glance}
            </div>
        </div>
    )
}

// Fast sessions as filled pills toward the target; the text already says the number.
function FastSessions({ done }: { done: number }) {
    return (
        <div aria-hidden="true" className="flex gap-1.5">
            {Array.from({ length: RACE_READINESS.FAST_SESSIONS_TARGET }, (_, index) => (
                <span
                    key={index}
                    className={cn(
                        'h-1.5 w-10 rounded-full transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
                        index < done ? 'bg-blue' : 'bg-ink/10'
                    )}
                />
            ))}
        </div>
    )
}

// Whether the last 4 weeks of running fit the next race: load and hard work at race pace or faster.
export function RaceReadinessCard({ readiness }: Props) {
    const { load, pace, race } = readiness

    return (
        <section
            data-testid="readiness-card"
            aria-label="Ready for the race"
            className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-700 motion-safe:delay-100"
        >
            <div className="rounded-[var(--radius-surface)] bg-card p-5 shadow-soft md:p-6">
                <header className="mb-4 space-y-1">
                    <p className="eyebrow text-muted-foreground">Last 4 weeks</p>
                    <h2 className="display text-2xl">Ready for the race</h2>
                </header>
                <div className="divide-y divide-hairline">
                    <ReadinessRow
                        id="load"
                        title="Load"
                        state={load.state}
                        reason={loadReason(load)}
                    />
                    <ReadinessRow
                        id="pace"
                        title="Pace"
                        state={pace.state}
                        reason={paceReason(pace, race.racePaceSPerKm)}
                        glance={
                            pace.state === 'no_data' ? null : (
                                <FastSessions done={pace.fastSessions} />
                            )
                        }
                    />
                </div>
            </div>
        </section>
    )
}
