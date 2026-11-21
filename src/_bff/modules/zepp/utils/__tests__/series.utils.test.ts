// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decodeAbsoluteSeries, decodeDeltaSeries } from '@/_bff/modules/zepp/utils/series.utils'
import { parseZeppDetail } from '@/_bff/modules/zepp/utils/schemas.utils'
import { readMock } from '@/_bff/modules/zepp/utils/__tests__/mocks'

describe('decodeDeltaSeries', () => {
    it('accumulates both the time offsets and the values', () => {
        expect(decodeDeltaSeries('142,99;1,-1;1,0')).toEqual([
            { offsetS: 142, value: 99 },
            { offsetS: 143, value: 98 },
            { offsetS: 144, value: 98 },
        ])
    })

    it('skips blank and malformed entries', () => {
        expect(decodeDeltaSeries('1,5;;x,y;2')).toEqual([{ offsetS: 1, value: 5 }])
        expect(decodeDeltaSeries('')).toEqual([])
    })

    it('decodes the real heart rate to the recorded range and the final offset', () => {
        const { heartRate } = parseZeppDetail(readMock('zepp_detail_mock.json'))
        const points = decodeDeltaSeries(heartRate)
        const values = points.map((point) => point.value)

        expect(points).toHaveLength(721)
        expect(points.at(-1)?.offsetS).toBe(1329)
        expect(Math.min(...values)).toBe(96)
        expect(Math.max(...values)).toBe(166)
    })
})

describe('decodeAbsoluteSeries', () => {
    it('keeps the values and accumulates only the time offsets', () => {
        expect(decodeAbsoluteSeries('0,0;142,0;1,596')).toEqual([
            { offsetS: 0, value: 0 },
            { offsetS: 142, value: 0 },
            { offsetS: 143, value: 596 },
        ])
    })
})
