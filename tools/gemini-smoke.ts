// Run with: pnpm dlx tsx tools/gemini-smoke.ts (NEXT_GEMINI_API_KEY and NEXT_COACH_MODEL loaded in the shell).
// Prints only OK or a status code: never the key, the response body or the prompt.

type SmokeOptions = {
    apiKey: string | undefined
    model: string | undefined
    fetch?: typeof fetch
}

type SmokeResult = 'ok' | { status: number | 'no-key' | 'network' }

// Fallback only when NEXT_COACH_MODEL is unset. Verify against Google's current model list.
const DEFAULT_SMOKE_MODEL = 'gemini-2.5-flash'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export async function runGeminiSmoke(options: SmokeOptions): Promise<SmokeResult> {
    if (!options.apiKey) return { status: 'no-key' }
    const doFetch = options.fetch ?? fetch
    const model = options.model ?? DEFAULT_SMOKE_MODEL
    try {
        const response = await doFetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: 'Reply with: ok' }] }],
            }),
        })
        return response.ok ? 'ok' : { status: response.status }
    } catch {
        return { status: 'network' }
    }
}

async function main() {
    const result = await runGeminiSmoke({
        apiKey: process.env.NEXT_GEMINI_API_KEY,
        model: process.env.NEXT_COACH_MODEL,
    })
    if (result === 'ok') {
        console.log('OK')
        return
    }
    console.log(result.status)
    process.exitCode = 1
}

if (process.argv[1]?.endsWith('gemini-smoke.ts')) void main()
