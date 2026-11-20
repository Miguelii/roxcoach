import { connection } from 'next/server'
import { createCaller } from '@/_bff/trpc/caller'
import { NextRaceView } from '@/modules/dashboard/next-race-view'

type Props = {
    today: string
}

// Reads cookies through the caller, so it must render inside a Suspense boundary.
export async function NextRace({ today }: Props) {
    await connection()
    const caller = await createCaller()
    const races = await caller.races.list({ status: ['upcoming'] })
    // Ordered by date: the first one not in the past is the next race.
    const next = races.find((race) => race.raceDate >= today) ?? null

    return <NextRaceView race={next} today={today} />
}
