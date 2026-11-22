// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { adaptZeppRun } from '@/_bff/modules/zepp/utils/adapter.utils'
import { parseZeppDetail, parseZeppHistory } from '@/_bff/modules/zepp/utils/schemas.utils'
import { readMock } from '@/_bff/modules/zepp/utils/__tests__/mocks'

const run = () => {
    const { summaries } = parseZeppHistory(readMock('zepp_history_mock.json'))
    const summary = summaries.find((item) => item.sportType === 1)
    if (summary === undefined) throw new Error('mock has no run')
    return { summary, detail: parseZeppDetail(readMock('zepp_detail_mock.json')) }
}

describe('adaptZeppRun', () => {
    it('maps the summary of the real run to the Roxcoach activity', () => {
        const { summary, detail } = run()
        const activity = adaptZeppRun(summary, detail)

        expect(activity).toMatchObject({
            startedAt: '2026-11-17T19:18:00.000Z',
            sportType: 'running',
            category: 'run',
            name: 'Run',
            distanceM: 3119.12,
            movingTimeS: 722,
            elapsedTimeS: 1329,
            elevationGainM: null,
            avgHr: 143,
            maxHr: 166,
            calories: 85,
            noteText: null,
        })
        expect(activity.avgSpeedMps).toBeCloseTo(4.32, 2)
    })

    it('uses the Zepp title as the name when there is one', () => {
        const { summary, detail } = run()

        expect(adaptZeppRun({ ...summary, sportTitle: 'Morning loop' }, detail).name).toBe(
            'Morning loop'
        )
    })

    it('builds one sample per distance point with the heart rate and speed carried forward', () => {
        const { summary, detail } = run()
        const { samples } = adaptZeppRun(summary, detail)
        const trackMs = 1794943080 * 1000

        expect(samples).toHaveLength(723)
        expect(samples[0]).toEqual({ t: trackMs, hr: null, distanceM: 0, speedMps: 1.38122 })
        expect(samples[1]).toEqual({ t: trackMs + 142_000, hr: 99, distanceM: 0, speedMps: 0 })
        expect(samples.at(-1)?.distanceM).toBeCloseTo(3115.05, 1)
        const rates = samples.flatMap((sample) => sample.hr ?? [])
        expect(Math.min(...rates)).toBe(96)
        expect(Math.max(...rates)).toBe(166)
    })

    it('has no heart rate samples when the detail has no heart rate', () => {
        const { summary, detail } = run()
        const activity = adaptZeppRun({ ...summary, avgHrBpm: null }, { ...detail, heartRate: '' })

        expect(activity.avgHr).toBeNull()
        expect(activity.samples.every((sample) => sample.hr === null)).toBe(true)
    })

    it('makes one lap per full kilometre from kilo_pace, with the moving time and heart rate', () => {
        const { summary, detail } = run()
        const { laps } = adaptZeppRun(summary, detail)

        expect(laps.slice(0, 3)).toEqual([
            {
                lapIndex: 1,
                name: null,
                startedAt: '2026-11-17T19:18:00.000Z',
                elapsedTimeS: 370,
                movingTimeS: 230,
                distanceM: 1000,
                avgHr: 133,
                avgSpeedMps: 1000 / 229.846,
                calories: null,
            },
            {
                lapIndex: 2,
                name: null,
                startedAt: '2026-11-17T19:24:10.000Z',
                elapsedTimeS: 489,
                movingTimeS: 235,
                distanceM: 1000,
                avgHr: 148,
                avgSpeedMps: 1000 / 235.284,
                calories: null,
            },
            {
                lapIndex: 3,
                name: null,
                startedAt: '2026-11-17T19:32:19.000Z',
                elapsedTimeS: 444,
                movingTimeS: 231,
                distanceM: 1000,
                avgHr: 146,
                avgSpeedMps: 1000 / 230.942,
                calories: null,
            },
        ])
    })

    it('ends with the partial last kilometre from the summary and the samples', () => {
        const { summary, detail } = run()
        const last = adaptZeppRun(summary, detail).laps.at(-1)

        expect(last).toMatchObject({
            lapIndex: 4,
            startedAt: '2026-11-17T19:39:43.000Z',
            elapsedTimeS: 26,
            movingTimeS: 26,
            calories: null,
        })
        expect(last?.distanceM).toBeCloseTo(119.12, 2)
        expect(last?.avgSpeedMps).toBeCloseTo(119.12 / 25.928, 3)
        expect(last?.avgHr).toBeGreaterThanOrEqual(140)
        expect(last?.avgHr).toBeLessThanOrEqual(170)
    })

    it('keeps the whole run as one lap when Zepp gives no kilometre splits', () => {
        const { summary, detail } = run()
        const { laps } = adaptZeppRun(summary, { ...detail, kiloPace: '' })

        expect(laps).toHaveLength(1)
        expect(laps[0]).toMatchObject({
            lapIndex: 1,
            startedAt: '2026-11-17T19:18:00.000Z',
            elapsedTimeS: 1329,
            movingTimeS: 722,
            distanceM: 3119.12,
            avgHr: 143,
        })
    })

    it('skips a kilo_pace entry it cannot read instead of shifting the laps', () => {
        const { summary, detail } = run()
        const kiloPace = `garbage;${detail.kiloPace}`

        expect(adaptZeppRun(summary, { ...detail, kiloPace }).laps).toHaveLength(4)
    })
})
