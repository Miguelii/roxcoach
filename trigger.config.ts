import { defineConfig } from '@trigger.dev/sdk'

// Read at deploy time by the Trigger.dev CLI, outside the Next.js runtime, so ServerEnv
// is not available here.
const project = process.env.TRIGGER_PROJECT_REF
if (!project) throw new Error('TRIGGER_PROJECT_REF is required to run the Trigger.dev CLI')

export default defineConfig({
    project,
    runtime: 'node-24',
    logLevel: 'log',
    maxDuration: 3600,
    retries: {
        enabledInDev: true,
        default: {
            maxAttempts: 1,
            minTimeoutInMs: 1000,
            maxTimeoutInMs: 10000,
            factor: 2,
            randomize: true,
        },
    },
    dirs: ['./src/_bff/modules/strava/jobs'],
    // The services the jobs import start with `import 'server-only'`, which throws unless the
    // `react-server` condition is active. Trigger's esbuild does not add it by default.
    build: { conditions: ['react-server'] },
})
