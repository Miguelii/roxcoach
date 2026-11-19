'use client'

import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useRaceForm, type RaceFormValues } from '@/modules/races/use-race-form'

type Props = {
    label?: string
}

type FormProps = {
    onDone: () => void
}

const TYPE_LABELS = { hyrox: 'Hyrox', running: 'Running' } as const

const PRIORITY_LABELS = {
    A: 'A: target race, full taper',
    B: 'B: tune-up, short taper',
    C: 'C: training race, no taper',
} as const

function RaceForm({ onDone }: FormProps) {
    const form = useRaceForm()
    const type = form.watch('type')

    const onSubmit = (values: RaceFormValues) => {
        toast.success(`Mockup: "${values.name}" would be added and the plan regenerated`)
        onDone()
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input placeholder="Hyrox Lisbon" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Type</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <FormControl>
                                        <SelectTrigger className="w-full">
                                            <SelectValue>{TYPE_LABELS[field.value]}</SelectValue>
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="hyrox">Hyrox</SelectItem>
                                        <SelectItem value="running">Running</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Date</FormLabel>
                                <FormControl>
                                    <Input type="date" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    {type === 'running' ? (
                        <FormField
                            control={form.control}
                            name="distanceKm"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Distance (km)</FormLabel>
                                    <FormControl>
                                        <Input inputMode="decimal" placeholder="10" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ) : (
                        <FormField
                            control={form.control}
                            name="division"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Division</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}
                    <FormField
                        control={form.control}
                        name="location"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Location</FormLabel>
                                <FormControl>
                                    <Input placeholder="Optional" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="target"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Goal time</FormLabel>
                                <FormControl>
                                    <Input placeholder="1:10:00" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="priority"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Priority</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <FormControl>
                                        <SelectTrigger className="w-full">
                                            <SelectValue>{field.value}</SelectValue>
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                                            <SelectItem key={value} value={value}>
                                                {label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onDone}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="ink">
                        Add race
                    </Button>
                </DialogFooter>
            </form>
        </Form>
    )
}

export function RaceDialog({ label = 'New race' }: Props) {
    const [open, setOpen] = useState(false)

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button variant="ink" />}>
                <IconPlus /> {label}
            </DialogTrigger>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="display text-3xl">New race</DialogTitle>
                    <DialogDescription>
                        The coach rebuilds your plan around every upcoming race. Priority decides
                        how much each one shapes it.
                    </DialogDescription>
                </DialogHeader>
                <RaceForm onDone={() => setOpen(false)} />
            </DialogContent>
        </Dialog>
    )
}
