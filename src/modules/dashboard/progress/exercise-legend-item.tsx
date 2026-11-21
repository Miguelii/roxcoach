import Image from 'next/image'
import { IconBarbell } from '@tabler/icons-react'
import { formatKg } from '@/_bff/core/utils/formatters.utils'
import type { TopExerciseDTO } from '@/_bff/modules/training/types/progress'
import { cn } from '@/lib/utils'
import { ChangeBadge } from '@/modules/dashboard/progress/change-badge'
import { SeriesMarker } from '@/modules/dashboard/progress/series-marker'
import type { SeriesStyle } from '@/modules/dashboard/progress/series-styles'
import type { ExerciseMode } from '@/modules/dashboard/progress/top-exercises-data'
import { exerciseSummary } from '@/modules/dashboard/progress/top-exercises-data'

type Props = {
    exercise: TopExerciseDTO
    style: SeriesStyle
    mode: ExerciseMode
    shown: boolean
    onToggle: () => void
}

// The legend entry of one exercise: its picture, the marker of its line, its latest top set and
// how far it moved. It is also the button that shows or hides the line.
export function ExerciseLegendItem({ exercise, style, mode, shown, onToggle }: Props) {
    const summary = exerciseSummary(exercise)
    const change = mode === 'kg' ? summary?.changeKg : summary?.changePct

    return (
        <button
            type="button"
            data-testid={`exercise-toggle-${exercise.key}`}
            aria-pressed={shown}
            onClick={onToggle}
            className={cn(
                'flex min-h-14 items-center gap-3 rounded-[var(--radius-surface-inner)] border border-ink/15 p-2 text-left',
                shown ? 'bg-card' : 'bg-muted text-muted-foreground'
            )}
        >
            <span className="relative size-12 shrink-0 overflow-hidden rounded-md border border-hairline bg-background">
                {exercise.imageUrl === null ? (
                    <IconBarbell
                        data-testid={`exercise-image-placeholder-${exercise.key}`}
                        aria-hidden="true"
                        className="absolute inset-0 m-auto size-6 text-muted-foreground"
                    />
                ) : (
                    <Image
                        data-testid={`exercise-image-${exercise.key}`}
                        src={exercise.imageUrl}
                        alt={`${exercise.name} demonstration`}
                        fill
                        sizes="48px"
                        className="object-contain p-0.5"
                    />
                )}
            </span>
            <span className="min-w-0 flex-1 space-y-0.5">
                <span className="flex items-center gap-2">
                    <svg
                        width="14"
                        height="14"
                        viewBox="-7 -7 14 14"
                        aria-hidden="true"
                        className="shrink-0"
                    >
                        <SeriesMarker kind={style.marker} color={style.color} />
                    </svg>
                    <span className={cn('truncate text-sm font-medium', !shown && 'line-through')}>
                        {exercise.name}
                    </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums">
                    <span data-testid={`exercise-latest-${exercise.key}`}>
                        {formatKg(summary?.latestKg) ?? '-'}
                    </span>
                    <ChangeBadge
                        delta={change ?? null}
                        format={(absolute) =>
                            mode === 'kg' ? (formatKg(absolute) ?? '') : `${absolute}%`
                        }
                        testId={`exercise-change-${exercise.key}`}
                    />
                </span>
            </span>
        </button>
    )
}
