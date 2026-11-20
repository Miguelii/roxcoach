// Run with: pnpm dlx tsx tools/gemini-smoke.ts [model-id]. Without an argument it checks every
// COACH_MODELS id in order; with one it checks only that id. `main()` loads the Next env files
// itself (importing this file loads nothing, so unit tests never read a real .env).
// Prints one line per model, `<id>: OK` or `<id>: <status>` (number, no-key or network): never the
// key, the response body or the prompt.

import { loadEnvConfig } from '@next/env'
import { COACH_MODELS } from '@/_bff/core/constants/coach-models.constants'

type SmokeOptions = {
    apiKey: string | undefined
    model: string
    fetch?: typeof fetch
}

type CheckOptions = {
    apiKey: string | undefined
    modelId?: string
    fetch?: typeof fetch
    print: (line: string) => void
}

type ModelArg = { ok: true; modelId: string | undefined } | { ok: false }

type SmokeResult = 'ok' | { status: number | 'no-key' | 'network' }

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export async function runGeminiSmoke(options: SmokeOptions): Promise<SmokeResult> {
    if (!options.apiKey) return { status: 'no-key' }
    const doFetch = options.fetch ?? fetch
    try {
        const response = await doFetch(
            `${ENDPOINT}/${encodeURIComponent(options.model)}:generateContent`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: 'Reply with: ok' }] }],
                }),
            }
        )
        return response.ok ? 'ok' : { status: response.status }
    } catch {
        return { status: 'network' }
    }
}

// Checks one model id, or every listed id in order; returns true when all are OK.
export async function runModelChecks(options: CheckOptions): Promise<boolean> {
    const ids =
        options.modelId !== undefined ? [options.modelId] : COACH_MODELS.map((model) => model.id)
    let allOk = true
    for (const id of ids) {
        const result = await runGeminiSmoke({
            apiKey: options.apiKey,
            model: id,
            fetch: options.fetch,
        })
        if (result === 'ok') {
            options.print(`${id}: OK`)
        } else {
            allOk = false
            options.print(`${id}: ${result.status}`)
        }
    }
    return allOk
}

const MODEL_ID_PATTERN = /^[\w.:-]+$/

// Validates the optional CLI model id: absent means all models, anything else must look like an id.
export function parseModelArg(arg: string | undefined): ModelArg {
    if (arg === undefined) return { ok: true, modelId: undefined }
    return MODEL_ID_PATTERN.test(arg) ? { ok: true, modelId: arg } : { ok: false }
}

async function main() {
    const parsed = parseModelArg(process.argv[2])
    if (!parsed.ok) {
        console.log(
            'Usage: gemini-smoke.ts [model-id] (letters, digits, dot, dash, colon, underscore)'
        )
        process.exitCode = 1
        return
    }
    loadEnvConfig(process.cwd())
    const allOk = await runModelChecks({
        apiKey: process.env.NEXT_GEMINI_API_KEY,
        modelId: parsed.modelId,
        print: console.log,
    })
    if (!allOk) process.exitCode = 1
}

if (process.argv[1]?.endsWith('gemini-smoke.ts')) void main()
