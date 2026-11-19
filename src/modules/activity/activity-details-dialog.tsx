'use client'

import { IconPlus } from '@tabler/icons-react'
import { toast } from 'sonner'
import { HYROX_STATIONS } from '@/_bff/core/constants/hyrox.constants'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Category } from '@/modules/mock/types'

type Props = {
    category: Category
}

export function ActivityDetailsDialog({ category }: Props) {
    return (
        <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>
                <IconPlus /> Add details
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="display text-3xl">Add details</DialogTitle>
                    <DialogDescription>
                        Effort and notes help the coach in the Sunday report. Strava distance, time
                        and heart rate are never changed.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <label className="grid gap-1.5 text-sm font-medium">
                            Effort (1 to 10)
                            <Input inputMode="numeric" placeholder="7" />
                        </label>
                    </div>
                    <label className="grid gap-1.5 text-sm font-medium">
                        Notes
                        <Textarea rows={3} placeholder="How did it feel?" />
                    </label>

                    {category === 'hyrox' && (
                        <fieldset className="grid gap-2">
                            <legend className="eyebrow mb-1 text-muted-foreground">
                                Station results
                            </legend>
                            {HYROX_STATIONS.map(({ key, label }) => (
                                <div
                                    key={key}
                                    className="grid grid-cols-[1fr_5rem_5rem_4rem] items-center gap-2"
                                >
                                    <span className="text-sm">{label}</span>
                                    <Input aria-label={`${label} time`} placeholder="mm:ss" />
                                    <Input aria-label={`${label} load`} placeholder="kg" />
                                    <Input aria-label={`${label} reps`} placeholder="reps" />
                                </div>
                            ))}
                        </fieldset>
                    )}

                    {category === 'strength' && (
                        <fieldset className="grid gap-2">
                            <legend className="eyebrow mb-1 text-muted-foreground">Sets</legend>
                            {['Back squat', 'Walking lunges', 'Farmers carry'].map((exercise) => (
                                <div
                                    key={exercise}
                                    className="grid grid-cols-[1fr_4rem_4rem_4rem] items-center gap-2"
                                >
                                    <span className="text-sm">{exercise}</span>
                                    <Input aria-label={`${exercise} sets`} placeholder="sets" />
                                    <Input aria-label={`${exercise} reps`} placeholder="reps" />
                                    <Input aria-label={`${exercise} load`} placeholder="kg" />
                                </div>
                            ))}
                        </fieldset>
                    )}
                </div>
                <DialogFooter>
                    <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
                    <DialogClose
                        render={<Button variant="ink" />}
                        onClick={() =>
                            toast.success('Mockup: details saved, the next report will use them')
                        }
                    >
                        Save
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
