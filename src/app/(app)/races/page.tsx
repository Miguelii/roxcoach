import type { Metadata } from 'next'
import { RaceCard } from '@/modules/races/race-card'
import { RaceDialog } from '@/modules/races/race-dialog'
import { completedRaces, upcomingRaces } from '@/modules/mock/data'

export const metadata: Metadata = { title: 'Races' }

export default function RacesPage() {
    const upcoming = upcomingRaces()
    const completed = completedRaces()

    return (
        <main className="main-container">
            <div className="flex items-center gap-3">
                <h1 className="display display-section">Races</h1>
                <div className="ml-auto">
                    <RaceDialog />
                </div>
            </div>

            <section aria-label="Upcoming races" className="grid gap-4 md:grid-cols-2">
                {upcoming.map((race) => (
                    <RaceCard key={race.id} race={race} />
                ))}
            </section>

            {completed.length > 0 && (
                <details className="group">
                    <summary className="eyebrow cursor-pointer text-muted-foreground">
                        Completed races ({completed.length})
                    </summary>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {completed.map((race) => (
                            <RaceCard key={race.id} race={race} />
                        ))}
                    </div>
                </details>
            )}
        </main>
    )
}
