import { connection } from 'next/server'
import { createCaller } from '@/_bff/trpc/caller'
import { addDays } from '@/modules/calendar/date-utils'
import { WeekStripView } from '@/modules/dashboard/week-strip-view'

type Props = {
    today: string
}

// Reads cookies through the caller, so it must render inside a Suspense boundary.
export async function WeekStrip({ today }: Props) {
    await connection()
    const caller = await createCaller()
    const items = await caller.training.getCalendar({ from: addDays(today, -34), to: today })

    return <WeekStripView items={items} today={today} />
}
