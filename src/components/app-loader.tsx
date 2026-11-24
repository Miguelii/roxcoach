const STATIONS = [
    'SkiErg',
    'Sled push',
    'Sled pull',
    'Burpee broad jumps',
    'Rowing',
    'Farmers carry',
    'Sandbag lunges',
    'Wall balls',
]

const STATION_SECONDS = 0.9

// Shown while the app renders. Pure CSS, so it animates before any JavaScript has loaded.
export function AppLoader() {
    return (
        <div
            role="status"
            aria-label="Loading"
            data-testid="app-loader"
            className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 px-6"
        >
            <div className="relative w-64 max-w-full pt-8">
                <div aria-hidden="true" className="station-dot absolute top-0 left-0 w-3">
                    <span className="block size-3 rounded-full bg-ink" />
                </div>
                <div aria-hidden="true" className="flex items-center justify-between">
                    {STATIONS.map((station) => (
                        <span key={station} className="h-3 w-0.5 rounded-full bg-hairline" />
                    ))}
                </div>
                <div aria-hidden="true" className="-mt-1.5 h-px bg-hairline" />
            </div>

            <p className="relative h-5 w-64 max-w-full text-center text-sm text-muted-foreground">
                {STATIONS.map((station, index) => (
                    <span
                        key={station}
                        data-testid="app-loader-station"
                        style={{ animationDelay: `${index * STATION_SECONDS}s` }}
                        className="station-label absolute inset-x-0"
                    >
                        {station}
                    </span>
                ))}
            </p>
        </div>
    )
}
