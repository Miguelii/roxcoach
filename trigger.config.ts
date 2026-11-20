import { defineConfig } from '@trigger.dev/sdk'

export default defineConfig({
    project: 'proj_caqikcfqvamfjozddvlk',
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
    // The services the jobs import start with `import 'server-only'`, which throws unless the
    // `react-server` condition is active. Trigger's esbuild does not add it by default.
    build: { conditions: ['react-server'] },
})
