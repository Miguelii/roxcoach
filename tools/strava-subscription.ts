// One-time Strava webhook subscription tool. Not part of the Next build.
//
// Run it with the four variables in the environment (for example `set -a; source .env.local; set +a`):
//   pnpm dlx tsx tools/strava-subscription.ts create        creates the subscription, prints its id
//   pnpm dlx tsx tools/strava-subscription.ts view          prints the current subscription id
//   pnpm dlx tsx tools/strava-subscription.ts delete <id>   deletes the subscription with that id
//
// Variables: NEXT_STRAVA_CLIENT_ID, NEXT_STRAVA_CLIENT_SECRET, NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN and
// NEXT_PUBLIC_WEBSITE_URL (the callback URL is `<site>/api/strava/webhook`). The client secret and
// the verify token are never printed, and neither is any Strava response body.
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

type Config = {
    clientId: string
    clientSecret: string
    verifyToken: string
    callbackUrl: string
}

type Command = 'create' | 'view' | 'delete'

type FetchFn = (url: string, init: RequestInit) => Promise<Response>

type Outcome = { ok: boolean; message: string }

type Env = Record<string, string | undefined>

export const PUSH_SUBSCRIPTIONS_URL = 'https://www.strava.com/api/v3/push_subscriptions'

const REQUIRED = [
    'NEXT_STRAVA_CLIENT_ID',
    'NEXT_STRAVA_CLIENT_SECRET',
    'NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN',
    'NEXT_PUBLIC_WEBSITE_URL',
] as const

const COMMANDS = new Set(['create', 'view', 'delete'])

export const readConfig = (
    env: Env
): { ok: true; config: Config } | { ok: false; missing: string[] } => {
    const missing = REQUIRED.filter((name) => !env[name])
    const clientId = env.NEXT_STRAVA_CLIENT_ID
    const clientSecret = env.NEXT_STRAVA_CLIENT_SECRET
    const verifyToken = env.NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN
    const site = env.NEXT_PUBLIC_WEBSITE_URL
    if (!clientId || !clientSecret || !verifyToken || !site) return { ok: false, missing }

    return {
        ok: true,
        config: {
            clientId,
            clientSecret,
            verifyToken,
            callbackUrl: `${site.replace(/\/+$/u, '')}/api/strava/webhook`,
        },
    }
}

const credentials = (config: Config) =>
    new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret })

const failed = (status: number): Outcome => ({
    ok: false,
    message: `Strava answered ${status}`,
})

const subscriptionSchema = z.object({ id: z.number() })

const readId = async (response: Response): Promise<number | null> => {
    const parsed = subscriptionSchema.safeParse(await response.json().catch(() => null))
    return parsed.success ? parsed.data.id : null
}

const readIds = async (response: Response): Promise<number[]> => {
    const parsed = z.array(subscriptionSchema).safeParse(await response.json().catch(() => null))
    return parsed.success ? parsed.data.map((subscription) => subscription.id) : []
}

const create = async (config: Config, fetchFn: FetchFn): Promise<Outcome> => {
    const body = credentials(config)
    body.set('callback_url', config.callbackUrl)
    body.set('verify_token', config.verifyToken)

    const response = await fetchFn(PUSH_SUBSCRIPTIONS_URL, { method: 'POST', body })
    if (!response.ok) return failed(response.status)

    const id = await readId(response)
    return id === null
        ? { ok: false, message: 'Strava answered without a subscription id' }
        : { ok: true, message: `Created subscription ${id}` }
}

const view = async (config: Config, fetchFn: FetchFn): Promise<Outcome> => {
    const response = await fetchFn(`${PUSH_SUBSCRIPTIONS_URL}?${credentials(config)}`, {
        method: 'GET',
    })
    if (!response.ok) return failed(response.status)

    const ids = await readIds(response)
    return {
        ok: true,
        message: ids.length === 0 ? 'No subscription' : `Subscription ids: ${ids.join(', ')}`,
    }
}

const remove = async (
    id: string | undefined,
    config: Config,
    fetchFn: FetchFn
): Promise<Outcome> => {
    if (id === undefined || !/^\d+$/u.test(id))
        return { ok: false, message: 'delete needs a numeric subscription id' }

    const response = await fetchFn(`${PUSH_SUBSCRIPTIONS_URL}/${id}?${credentials(config)}`, {
        method: 'DELETE',
    })
    return response.ok
        ? { ok: true, message: `Deleted subscription ${id}` }
        : failed(response.status)
}

// Never throws and never includes a response body or an error cause in the outcome.
export const runCommand = async (
    command: Command,
    id: string | undefined,
    config: Config,
    fetchFn: FetchFn
): Promise<Outcome> => {
    try {
        if (command === 'create') return await create(config, fetchFn)
        if (command === 'view') return await view(config, fetchFn)
        return await remove(id, config, fetchFn)
    } catch {
        return { ok: false, message: 'Request to Strava failed' }
    }
}

const main = async () => {
    const [command, id] = process.argv.slice(2)
    if (command === undefined || !COMMANDS.has(command)) {
        console.error('Usage: tools/strava-subscription.ts <create|view|delete> [id]')
        process.exitCode = 1
        return
    }

    const read = readConfig(process.env)
    if (!read.ok) {
        console.error(`Missing environment variables: ${read.missing.join(', ')}`)
        process.exitCode = 1
        return
    }

    // SAFETY: the command was checked against COMMANDS above.
    const outcome = await runCommand(command as Command, id, read.config, fetch)
    const print = outcome.ok ? console.log : console.error
    print(outcome.message)
    if (!outcome.ok) process.exitCode = 1
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) void main()
