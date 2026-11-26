// Run with: pnpm dlx tsx tools/gemini-live-smoke.ts <16 kHz mono 16-bit wav>. Creates a one-use
// ephemeral token, streams the clip to gemini-3.5-transcribe-live over the Live API socket in
// 100 ms chunks and prints every server message, so the token and message shapes can be confirmed
// before the coach relies on them. Long strings in the token response are redacted; the key never
// prints. `main()` loads the Next env files itself (importing this file loads nothing).

import { readFile } from 'node:fs/promises'
import { loadEnvConfig } from '@next/env'
import { z } from 'zod'
import {
    liveSetupMessage,
    liveSocketUrl,
    liveTokenRequestBody,
} from '@/_bff/core/constants/transcribe-live.constants'

type TokenOptions = { apiKey: string | undefined; now: Date; fetch?: typeof fetch }

type TokenResult =
    | { ok: true; body: unknown }
    | { status: number; body: string }
    | { status: 'no-key' | 'network' }

const TOKEN_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens'
const WAV_HEADER_BYTES = 44
const CHUNK_BYTES = 3200
const CHUNK_INTERVAL_MS = 100
const LINGER_MS = 10_000
const REDACT_OVER = 20

export async function createLiveToken(options: TokenOptions): Promise<TokenResult> {
    if (!options.apiKey) return { status: 'no-key' }
    const doFetch = options.fetch ?? fetch
    try {
        const response = await doFetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
            body: JSON.stringify(liveTokenRequestBody(options.now)),
        })
        if (!response.ok) return { status: response.status, body: await response.text() }
        return { ok: true, body: await response.json() }
    } catch {
        return { status: 'network' }
    }
}

export function pcmChunksFromWav(wav: Uint8Array): Uint8Array[] {
    const chunks: Uint8Array[] = []
    for (let offset = WAV_HEADER_BYTES; offset < wav.byteLength; offset += CHUNK_BYTES)
        chunks.push(wav.subarray(offset, offset + CHUNK_BYTES))
    return chunks
}

const LONG_STRING = new RegExp(`"((?:[^"\\\\]|\\\\.){${REDACT_OVER + 1},})"`, 'gu')

const TokenSchema = z.object({ name: z.string() })

// Shortens every long JSON string literal (the token value among them) before printing.
export function redact(json: string): string {
    return json.replaceAll(LONG_STRING, (_match, text: string) => `"${text.slice(0, 6)}..."`)
}

const wait = (ms: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms)
    })

const messageText = async (data: Blob | string) => {
    const text = z.string().safeParse(data)
    return text.success ? text.data : new Response(data).text()
}

async function main() {
    const file = process.argv[2]
    if (!file) {
        console.log('Usage: gemini-live-smoke.ts <16 kHz mono 16-bit wav>')
        process.exitCode = 1
        return
    }
    loadEnvConfig(process.cwd())
    const token = await createLiveToken({
        apiKey: process.env.NEXT_GEMINI_API_KEY,
        now: new Date(),
    })
    if (!('ok' in token)) {
        console.log(`token: ${token.status}`)
        if ('body' in token) console.log(token.body)
        process.exitCode = 1
        return
    }
    console.log('token response:', redact(JSON.stringify(token.body, null, 2)))
    const parsed = TokenSchema.safeParse(token.body)
    if (!parsed.success) {
        console.log('no `name` field in the token response, stopping')
        process.exitCode = 1
        return
    }

    const chunks = pcmChunksFromWav(new Uint8Array(await readFile(file)))
    const socket = new WebSocket(liveSocketUrl(parsed.data.name))
    const setup = Promise.withResolvers<void>()
    socket.addEventListener('open', () => {
        console.log('socket: open')
        socket.send(JSON.stringify(liveSetupMessage()))
    })
    socket.addEventListener('message', async (event) => {
        const text = await messageText(event.data)
        console.log('message:', text)
        if (text.includes('setupComplete')) setup.resolve()
    })
    socket.addEventListener('close', (event) =>
        console.log(`socket: close ${event.code} ${event.reason}`)
    )
    socket.addEventListener('error', () => console.log('socket: error'))

    await setup.promise
    for (const chunk of chunks) {
        socket.send(
            JSON.stringify({
                realtimeInput: {
                    audio: {
                        data: Buffer.from(chunk).toString('base64'),
                        mimeType: 'audio/pcm;rate=16000',
                    },
                },
            })
        )
        // oxlint-disable-next-line no-await-in-loop -- chunks are paced like a live microphone
        await wait(CHUNK_INTERVAL_MS)
    }
    socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }))
    console.log('sent audioStreamEnd')
    await wait(LINGER_MS)
    socket.close()
}

if (process.argv[1]?.endsWith('gemini-live-smoke.ts')) void main()
