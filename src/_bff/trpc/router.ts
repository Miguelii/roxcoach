import { router } from '@/_bff/trpc/server'
import { ATHLETE_ROUTER } from '@/_bff/modules/athlete/athlete.router'
import { AUTH_ROUTER } from '@/_bff/modules/auth/auth.router'
import { COACH_ROUTER } from '@/_bff/modules/coach/coach.router'
import { RACES_ROUTER } from '@/_bff/modules/races/races.router'
import { TRAINING_ROUTER } from '@/_bff/modules/training/training.router'
import { LYFTA_ROUTER } from '@/_bff/modules/lyfta/lyfta.router'

export const appRouter = router({
    athlete: ATHLETE_ROUTER,
    auth: AUTH_ROUTER,
    coach: COACH_ROUTER,
    races: RACES_ROUTER,
    training: TRAINING_ROUTER,
    lyfta: LYFTA_ROUTER,
})

export type AppRouter = typeof appRouter
