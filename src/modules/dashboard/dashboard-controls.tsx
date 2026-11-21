import { PROGRESS_RANGES, type ProgressRange } from '@/_bff/core/constants/progress.constants'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Props = {
    range: ProgressRange
    onRangeChange: (range: ProgressRange) => void
}

const RANGE_LABELS: Record<ProgressRange, string> = { '3m': '3M', '6m': '6M', '12m': '1Y' }

// Tabs report any string; only accept a range this control offers.
const asRange = (value: string) => PROGRESS_RANGES.find((range) => range === value)

// How far back the charts look, kept in the URL. The Running or Strength choice lives in the
// sidebar and in Settings, not here.
export function DashboardControls({ range, onRangeChange }: Props) {
    return (
        <div data-testid="dashboard-controls" className="w-full sm:w-auto">
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
