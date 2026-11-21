'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Props = {
    caption: string
    columns: string[]
    rows: (string | number | null)[][]
    testId: string
    // Open from the start, for series too short to draw.
    defaultOpen?: boolean
}

// The same numbers as the chart, as a real table: the fallback for screen readers and for series
// too short to draw. Collapsed until asked for.
export function ChartDataTable({ caption, columns, rows, testId, defaultOpen = false }: Props) {
    const [open, setOpen] = useState(defaultOpen)

    return (
        <div className="space-y-2">
            <Button
                variant="ghost"
                size="sm"
                data-testid={`${testId}-toggle`}
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
            >
                {open ? 'Hide table' : 'View as table'}
            </Button>
            {open ? (
                <div className="max-h-72 overflow-auto">
                    <table data-testid={testId} className="w-full text-left text-sm tabular-nums">
                        <caption className="sr-only">{caption}</caption>
                        <thead>
                            <tr>
                                {columns.map((column) => (
                                    <th
                                        key={column}
                                        scope="col"
                                        className="pr-4 pb-1 text-xs font-medium text-muted-foreground"
                                    >
                                        {column}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={rowIndex} data-testid={`${testId}-row`}>
                                    {row.map((cell, cellIndex) => (
                                        <td key={cellIndex} className="py-0.5 pr-4">
                                            {cell ?? '-'}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </div>
    )
}
