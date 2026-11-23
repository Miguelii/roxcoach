'use client'

import { useMemo, useState } from 'react'
import type { LogEntry, LogLevel, LogRange } from '@/_bff/core/constants/logs.constants'
import { buildFacets, buildHistogram, filterLogs } from '@/modules/logs/logs.utils'

type Props = {
    logs: LogEntry[]
    range: LogRange
    fetchedAt: string
}

const toggled = <T>(selection: T[], value: T): T[] =>
    selection.includes(value) ? selection.filter((item) => item !== value) : [...selection, value]

export function useLogsExplorer({ logs, range, fetchedAt }: Props) {
    const [levels, setLevels] = useState<LogLevel[]>([])
    const [sources, setSources] = useState<string[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)

    const filteredLogs = useMemo(
        () => filterLogs(logs, { levels, sources }),
        [logs, levels, sources]
    )
    // Each facet counts inside the other filter, so its own choices stay visible.
    const levelFacets = useMemo(
        () => buildFacets(filterLogs(logs, { levels: [], sources }), 'level'),
        [logs, sources]
    )
    const sourceFacets = useMemo(
        () => buildFacets(filterLogs(logs, { levels, sources: [] }), 'prefix'),
        [logs, levels]
    )
    const histogram = useMemo(
        () => buildHistogram(filteredLogs, range, Date.parse(fetchedAt)),
        [filteredLogs, range, fetchedAt]
    )

    return {
        levels,
        sources,
        filteredLogs,
        levelFacets,
        sourceFacets,
        histogram,
        selectedLog: logs.find((log) => log.id === selectedId) ?? null,
        hasFilters: levels.length > 0 || sources.length > 0,
        toggleLevel: (level: LogLevel) => setLevels((current) => toggled(current, level)),
        toggleSource: (source: string) => setSources((current) => toggled(current, source)),
        clearFilters: () => {
            setLevels([])
            setSources([])
        },
        selectLog: (id: string) => setSelectedId(id),
        closeDetails: () => setSelectedId(null),
    }
}
