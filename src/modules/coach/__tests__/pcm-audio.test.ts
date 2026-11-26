import { describe, expect, it } from 'vitest'
import {
    createChunker,
    downsample,
    encodeWav,
    pcmToBase64,
    toPcm16,
} from '@/modules/coach/pcm-audio'

const near = (actual: Float32Array, expected: number[]) => {
    expect(actual).toHaveLength(expected.length)
    expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 5))
}

describe('downsample', () => {
    it('averages each window from 48 kHz to 16 kHz', () => {
        near(downsample(Float32Array.of(0.3, 0.3, 0.3, 0.6, 0.6, 0.6), 48_000), [0.3, 0.6])
    })

    it('returns an equal copy at the same rate', () => {
        const input = Float32Array.of(0.1, 0.2)
        const output = downsample(input, 16_000)
        near(output, [0.1, 0.2])
        expect(output).not.toBe(input)
    })

    it('rounds the length down at 44.1 kHz', () => {
        expect(downsample(new Float32Array(441), 44_100)).toHaveLength(160)
    })
})

describe('toPcm16', () => {
    it('clamps and scales to 16-bit integers', () => {
        expect(Array.from(toPcm16(Float32Array.of(1.5, -2, 0, 0.5)))).toEqual([
            32767, -32768, 0, 16384,
        ])
    })
})

describe('pcmToBase64', () => {
    it('encodes little-endian bytes', () => {
        expect(pcmToBase64(Int16Array.of(1, -1))).toBe('AQD//w==')
    })
})

describe('encodeWav', () => {
    it('writes a 44 byte PCM header and every chunk', async () => {
        const wav = encodeWav([Int16Array.of(1, 2), Int16Array.of(3, 4)])
        expect(wav.type).toBe('audio/wav')
        const view = new DataView(await wav.arrayBuffer())
        const text = (offset: number) =>
            String.fromCodePoint(...new Uint8Array(view.buffer, offset, 4))
        expect(view.byteLength).toBe(52)
        expect(text(0)).toBe('RIFF')
        expect(view.getUint32(4, true)).toBe(44)
        expect(text(8)).toBe('WAVE')
        expect(text(12)).toBe('fmt ')
        expect(view.getUint16(20, true)).toBe(1)
        expect(view.getUint16(22, true)).toBe(1)
        expect(view.getUint32(24, true)).toBe(16_000)
        expect(view.getUint32(28, true)).toBe(32_000)
        expect(view.getUint16(34, true)).toBe(16)
        expect(text(36)).toBe('data')
        expect(view.getUint32(40, true)).toBe(8)
        expect(view.getInt16(50, true)).toBe(4)
    })
})

describe('createChunker', () => {
    it('emits 1600 sample chunks and the remainder on flush', () => {
        const chunks: Int16Array[] = []
        const chunker = createChunker((chunk) => chunks.push(chunk))
        chunker.push(new Int16Array(1000).fill(1))
        expect(chunks).toHaveLength(0)
        chunker.push(new Int16Array(1000).fill(2))
        expect(chunks.map((chunk) => chunk.length)).toEqual([1600])
        expect(chunks[0]?.[999]).toBe(1)
        expect(chunks[0]?.[1000]).toBe(2)
        chunker.flush()
        expect(chunks.map((chunk) => chunk.length)).toEqual([1600, 400])
    })

    it('emits nothing for an empty flush', () => {
        const chunks: Int16Array[] = []
        const chunker = createChunker((chunk) => chunks.push(chunk))
        chunker.flush()
        expect(chunks).toHaveLength(0)
    })
})
