import { router } from '@/_bff/trpc/server'
import { ATHLETE_ROUTER } from '@/_bff/modules/athlete/athlete.router'
import { AUTH_ROUTER } from '@/_bff/modules/auth/auth.router'
import { TRAINING_ROUTER } from '@/_bff/modules/training/training.router'

export const appRouter = router({
    athlete: ATHLETE_ROUTER,
    auth: AUTH_ROUTER,
    training: TRAINING_ROUTER,
})

export type AppRouter = typeof appRouter
