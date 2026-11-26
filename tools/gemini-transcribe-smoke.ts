// Run with: pnpm dlx tsx tools/gemini-transcribe-smoke.ts <audio file> [mime type]. Sends the clip
// inline to gemini-3.5-transcribe through the Interactions API and prints the status and the
// response body, so the request and response shape can be confirmed before the coach relies on
// it. The body is printed because the clip is the athlete's own test recording; the key never is.
// `main()` loads the Next env files itself (importing this file loads nothing).

import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { loadEnvConfig } from '@next/env'

type SmokeOptions = {
    apiKey: string | undefined
    bytes: Uint8Array
    mimeType: string
    fetch?: typeof fetch
}

type SmokeResult =
    | { ok: true; body: unknown }
    | { status: number; body: string }
    | { status: 'no-key' | 'network' }

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const MODEL_ID = 'gemini-3.5-transcribe'

const MIME_BY_EXTENSION = new Map([
    ['.webm', 'audio/webm'],
    ['.m4a', 'audio/mp4'],
    ['.mp4', 'audio/mp4'],
    ['.mp3', 'audio/mpeg'],
    ['.wav', 'audio/wav'],
    ['.ogg', 'audio/ogg'],
])

export function mimeTypeFor(file: string): string | null {
    return MIME_BY_EXTENSION.get(extname(file).toLowerCase()) ?? null
}

export async function runTranscribeSmoke(options: SmokeOptions): Promise<SmokeResult> {
    if (!options.apiKey) return { status: 'no-key' }
    const doFetch = options.fetch ?? fetch
    try {
        const response = await doFetch(ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
            body: JSON.stringify({
                model: MODEL_ID,
                input: [
                    {
                        type: 'audio',
                        data: Buffer.from(options.bytes).toString('base64'),
                        mime_type: options.mimeType,
                    },
                ],
                generation_config: { transcription_config: { mode: 'smart' } },
            }),
        })
        if (!response.ok) return { status: response.status, body: await response.text() }
        return { ok: true, body: await response.json() }
    } catch {
        return { status: 'network' }
    }
}

async function main() {
    const [file, mimeOverride] = process.argv.slice(2)
    const mimeType = mimeOverride ?? (file ? mimeTypeFor(file) : null)
    if (!file || !mimeType) {
        console.log('Usage: gemini-transcribe-smoke.ts <audio file> [mime type]')
        process.exitCode = 1
        return
    }
    loadEnvConfig(process.cwd())
    const result = await runTranscribeSmoke({
        apiKey: process.env.NEXT_GEMINI_API_KEY,
        bytes: new Uint8Array(await readFile(file)),
        mimeType,
    })
    if ('ok' in result) {
        console.log(`${MODEL_ID} ${mimeType}: OK`)
        console.log(JSON.stringify(result.body, null, 2))
        return
    }
    console.log(`${MODEL_ID} ${mimeType}: ${result.status}`)
    if ('body' in result) console.log(result.body)
    process.exitCode = 1
}

if (process.argv[1]?.endsWith('gemini-transcribe-smoke.ts')) void main()
