// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseZeppDetail, parseZeppHistory } from '@/_bff/modules/zepp/utils/schemas.utils'
import { readMock } from '@/_bff/modules/zepp/utils/__tests__/mocks'

describe('parseZeppHistory', () => {
    it('reads every summary of the real history and the paging marker', () => {
        const { summaries, next } = parseZeppHistory(readMock('zepp_history_mock.json'))

        expect(summaries).toHaveLength(8)
        expect(next).toBe(-1)
    })

    it('maps the outdoor run to typed numbers', () => {
        const { summaries } = parseZeppHistory(readMock('zepp_history_mock.json'))
        const run = summaries.find((summary) => summary.sportType === 1)

        expect(run).toEqual({
            trackId: '1794943080',
            source: 'run.9765121.huami.com',
            sportType: 1,
            distanceM: 3119.12,
            movingTimeS: 722,
            endTimeS: 1794944409,
            avgHrBpm: 143,
            maxHrBpm: 166,
            calories: 85,
            sportTitle: null,
        })
    })

    it('keeps a real heart rate on a workout without distance', () => {
        const { summaries } = parseZeppHistory(readMock('zepp_history_mock.json'))

        expect(summaries.find((summary) => summary.sportType === 214)?.avgHrBpm).toBe(98)
    })

    it('turns sentinel values into null', () => {
        const { summaries } = parseZeppHistory({
            data: {
                next: -1,
                summary: [
                    {
                        trackid: '1',
                        source: 's',
                        type: 1,
                        dis: '5.0',
                        run_time: '10',
                        end_time: '11',
                        avg_heart_rate: '0.0',
                        max_heart_rate: -1,
                        calorie: '0.0',
                        sport_title: ' ',
                    },
                ],
            },
        })

        expect(summaries[0]).toMatchObject({
            avgHrBpm: null,
            maxHrBpm: null,
            calories: null,
            sportTitle: null,
        })
    })

    it('rejects a body that is not a history', () => {
        expect(() => parseZeppHistory({ code: 0 })).toThrow()
    })
})

describe('parseZeppDetail', () => {
    it('keeps the three series the adapter needs', () => {
        const detail = parseZeppDetail(readMock('zepp_detail_mock.json'))

        expect(detail.trackId).toBe('1794943080')
        expect(detail.heartRate.startsWith('142,99;1,-1')).toBe(true)
        expect(detail.distance.startsWith('0,0.00000;142,0.00000')).toBe(true)
        expect(detail.speed.startsWith('0,1.38122;142,0.00000')).toBe(true)
    })

    it('uses an empty series when one is missing', () => {
        expect(parseZeppDetail({ data: { trackid: 7 } })).toEqual({
            trackId: '7',
            heartRate: '',
            distance: '',
            speed: '',
            kiloPace: '',
        })
    })
})
