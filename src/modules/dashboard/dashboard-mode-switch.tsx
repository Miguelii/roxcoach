import { IconBarbell, IconRun } from '@tabler/icons-react'
import { DASHBOARD_MODES, type DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type Props = {
    mode: DashboardMode
    onChange: (mode: DashboardMode) => void
    // Prefix of the test ids: `<prefix>-run` and `<prefix>-strength`.
    testIdPrefix: string
    // Smaller, for the sidebar.
    compact?: boolean
}

const MODE_LABELS: Record<DashboardMode, string> = { run: 'Running', strength: 'Strength' }
const MODE_ICONS = { run: IconRun, strength: IconBarbell }

// Tabs report any string; only accept a mode this control offers.
const asMode = (value: string) => DASHBOARD_MODES.find((mode) => mode === value)

// The Running or Strength choice as a segmented control, used in the sidebar and in Settings.
export function DashboardModeSwitch({ mode, onChange, testIdPrefix, compact = false }: Props) {
    return (
        <Tabs
            value={mode}
            onValueChange={(value) => {
                const next = asMode(value)
                if (next !== undefined) onChange(next)
            }}
            className="w-full"
        >
            <TabsList aria-label="Dashboard mode" className="grid h-auto w-full grid-cols-2">
                {DASHBOARD_MODES.map((value) => {
                    const Icon = MODE_ICONS[value]
                    return (
                        <TabsTrigger
                            key={value}
                            value={value}
                            data-testid={`${testIdPrefix}-${value}`}
                            className={cn('gap-1.5', compact ? 'h-9 px-2 text-xs' : 'h-11 sm:h-9')}
                        >
                            <Icon className="size-4" aria-hidden="true" />
                            {MODE_LABELS[value]}
                        </TabsTrigger>
                    )
                })}
            </TabsList>
        </Tabs>
    )
}
