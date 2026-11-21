import { DASHBOARD_MODES, type DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { PROGRESS_RANGES, type ProgressRange } from '@/_bff/core/constants/progress.constants'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Props = {
    mode: DashboardMode
    onModeChange: (mode: DashboardMode) => void
    range: ProgressRange
    onRangeChange: (range: ProgressRange) => void
}

const MODE_LABELS: Record<DashboardMode, string> = { run: 'Running', strength: 'Strength' }
const RANGE_LABELS: Record<(typeof PROGRESS_RANGES)[number], string> = {
    '3m': '3M',
    '6m': '6M',
    '12m': '1Y',
}

// Tabs report any string; only accept values this control offers.
const asMode = (value: string) => DASHBOARD_MODES.find((mode) => mode === value)
const asRange = (value: string) => PROGRESS_RANGES.find((range) => range === value)

// Two segmented controls: what the dashboard shows (saved in the profile) and how far back (URL).
export function DashboardControls({ mode, onModeChange, range, onRangeChange }: Props) {
    return (
        <div
            data-testid="dashboard-controls"
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
            <Tabs
                value={mode}
                onValueChange={(value) => {
                    const next = asMode(value)
                    if (next !== undefined) onModeChange(next)
                }}
                className="w-full sm:w-auto"
            >
                <TabsList
                    aria-label="Dashboard mode"
                    className="grid h-auto w-full grid-cols-2 sm:w-fit"
                >
                    {DASHBOARD_MODES.map((value) => (
                        <TabsTrigger
                            key={value}
                            value={value}
                            data-testid={`mode-tab-${value}`}
                            className="h-11 sm:h-8 sm:px-5"
                        >
                            {MODE_LABELS[value]}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
            <Tabs
                value={range}
                onValueChange={(value) => {
                    const next = asRange(value)
                    if (next !== undefined) onRangeChange(next)
                }}
                className="w-full sm:w-auto"
            >
                <TabsList
                    aria-label="Time range"
                    className="grid h-auto w-full grid-cols-3 sm:w-fit"
                >
                    {PROGRESS_RANGES.map((value) => (
                        <TabsTrigger
                            key={value}
                            value={value}
                            data-testid={`range-tab-${value}`}
                            className="h-11 sm:h-8 sm:px-4"
                        >
                            {RANGE_LABELS[value]}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        </div>
    )
}
