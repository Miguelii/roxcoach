import {
    LIVE_CHUNK_SAMPLES,
    LIVE_SAMPLE_RATE,
} from '@/_bff/core/constants/transcribe-live.constants'

type Chunker = { push: (pcm: Int16Array) => void; flush: () => void }

const WAV_HEADER_BYTES = 44
const BASE64_SLICE = 0x8000

// Averages each window of input samples into one output sample (a box filter), enough for speech.
export function downsample(
    input: Float32Array,
    inputRate: number,
    outputRate = LIVE_SAMPLE_RATE
): Float32Array {
    if (inputRate === outputRate) return input.slice()
    const ratio = inputRate / outputRate
    const output = new Float32Array(Math.floor(input.length / ratio))
    for (let index = 0; index < output.length; index += 1) {
        const start = Math.floor(index * ratio)
        const end = Math.min(input.length, Math.floor((index + 1) * ratio))
        let sum = 0
        for (let at = start; at < end; at += 1) sum += input[at] ?? 0
        output[index] = sum / Math.max(1, end - start)
    }
    return output
}

export function toPcm16(samples: Float32Array): Int16Array {
    return Int16Array.from(samples, (sample) => {
        const clamped = Math.max(-1, Math.min(1, sample))
        return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff)
    })
}

// Typed arrays use the platform byte order, which is little-endian on every browser platform.
export function pcmToBase64(pcm: Int16Array): string {
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += BASE64_SLICE)
        binary += String.fromCodePoint(...bytes.subarray(offset, offset + BASE64_SLICE))
    return btoa(binary)
}

export function encodeWav(chunks: Int16Array[], sampleRate = LIVE_SAMPLE_RATE): Blob {
    const dataBytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
    const header = new DataView(new ArrayBuffer(WAV_HEADER_BYTES))
    const writeText = (offset: number, text: string) =>
        [...text].forEach((char, index) =>
            header.setUint8(offset + index, char.codePointAt(0) ?? 0)
        )
    writeText(0, 'RIFF')
    header.setUint32(4, WAV_HEADER_BYTES - 8 + dataBytes, true)
    writeText(8, 'WAVE')
    writeText(12, 'fmt ')
    header.setUint32(16, 16, true)
    header.setUint16(20, 1, true)
    header.setUint16(22, 1, true)
    header.setUint32(24, sampleRate, true)
    header.setUint32(28, sampleRate * 2, true)
    header.setUint16(32, 2, true)
    header.setUint16(34, 16, true)
    writeText(36, 'data')
    header.setUint32(40, dataBytes, true)
    return new Blob([header.buffer, ...chunks.map((chunk) => chunk.slice().buffer)], {
        type: 'audio/wav',
    })
}

export function createChunker(onChunk: (chunk: Int16Array) => void): Chunker {
    let buffer = new Int16Array(LIVE_CHUNK_SAMPLES)
    let filled = 0
    return {
        push: (pcm) => {
            let read = 0
            while (read < pcm.length) {
                const take = Math.min(LIVE_CHUNK_SAMPLES - filled, pcm.length - read)
                buffer.set(pcm.subarray(read, read + take), filled)
                filled += take
                read += take
                if (filled === LIVE_CHUNK_SAMPLES) {
                    onChunk(buffer)
                    buffer = new Int16Array(LIVE_CHUNK_SAMPLES)
                    filled = 0
                }
            }
        },
        flush: () => {
            if (filled === 0) return
            onChunk(buffer.slice(0, filled))
            buffer = new Int16Array(LIVE_CHUNK_SAMPLES)
            filled = 0
        },
    }
}
