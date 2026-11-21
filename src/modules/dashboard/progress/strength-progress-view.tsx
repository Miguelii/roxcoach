import Link from 'next/link'
import type { StrengthProgressDTO } from '@/_bff/modules/training/types/progress'
import { ExerciseCard } from '@/modules/dashboard/progress/exercise-card'

type Props = {
    data: StrengthProgressDTO
}

// The strength mode of the dashboard: one chart per most used exercise, one below the other.
export function StrengthProgressView({ data }: Props) {
    if (data.exercises.length === 0)
        return (
            <p
                data-testid="strength-progress-empty"
                className="rounded-[var(--radius-surface)] border border-ink/10 bg-card p-5 text-sm text-muted-foreground"
            >
                <Link href="/settings" className="underline">
                    Sync Lyfta
                </Link>{' '}
                to see your progress.
            </p>
        )

    return (
        <section data-testid="strength-progress" aria-label="Top exercises" className="space-y-3">
            <header className="space-y-1">
                <h2 className="display text-xl">Top exercises</h2>
                <p className="text-sm text-muted-foreground">
                    The heaviest set of every workout, for your most used lifts.
                </p>
            </header>
            <div className="grid gap-3 lg:grid-cols-2">
                {data.exercises.map((exercise) => (
                    <ExerciseCard key={exercise.key} exercise={exercise} />
                ))}
            </div>
        </section>
    )
}
