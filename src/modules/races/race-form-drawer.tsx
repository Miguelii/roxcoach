'use client'

import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useWatch } from 'react-hook-form'
import type { HyroxDivision } from '@/_bff/core/constants/hyrox.constants'
import type { RaceInput } from '@/_bff/modules/races/types'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { DrawerFormLayout } from '@/components/ui/drawer-form-layout'
import { Form } from '@/components/ui/form'
import {
    emptyRaceFormValues,
    toRaceInput,
    useRaceForm,
    type RaceFormValues,
} from '@/modules/races/use-race-form'
import { RaceFormFields } from '@/modules/races/race-form-fields'

type Props = {
    mode: 'create' | 'edit'
    // Null in create mode: the form starts empty with the profile division.
    defaults: RaceFormValues | null
    today: string
    defaultDivision: HyroxDivision | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (input: RaceInput) => Promise<void>
}

type BodyProps = Omit<Props, 'open' | 'onOpenChange'> & {
    onClose: () => void
    onSubmittingChange: (submitting: boolean) => void
}

function RaceFormBody({
    mode,
    defaults,
    today,
    defaultDivision,
    onSubmit,
    onClose,
    onSubmittingChange,
}: BodyProps) {
    const form = useRaceForm(
        defaults ?? emptyRaceFormValues(defaultDivision),
        today,
        mode === 'edit' ? defaults?.raceDate : undefined
    )
    const raceType = useWatch({ control: form.control, name: 'raceType' })

    const submit = async (values: RaceFormValues) => {
        onSubmittingChange(true)
        try {
            await onSubmit(toRaceInput(values))
            onClose()
        } catch {
            // The caller reports the failure (toast); the drawer stays open for another try.
        } finally {
            onSubmittingChange(false)
        }
    }

    return (
        <Form {...form}>
            <form
                data-testid="race-form"
                onSubmit={form.handleSubmit(submit)}
                className="flex min-h-0 flex-1 flex-col"
                noValidate
            >
                <DrawerFormLayout
                    title={mode === 'create' ? 'New race' : 'Edit race'}
                    description="Set the race date, goal time and priority so your coach knows your goal."
                    closeLabel="Close race form"
                    closeTestId="race-form-close"
                    cancelTestId="race-form-cancel"
                    closeDisabled={form.formState.isSubmitting}
                    onDismiss={onClose}
                    primaryAction={
                        <Button
                            type="submit"
                            data-testid="race-form-submit"
                            disabled={form.formState.isSubmitting}
                        >
                            {form.formState.isSubmitting ? (
                                <Loader2Icon className="animate-spin" />
                            ) : null}
                            {mode === 'create' ? 'Add race' : 'Save race'}
                        </Button>
                    }
                >
                    <RaceFormFields
                        form={form}
                        defaultDivision={defaultDivision}
                        raceType={raceType}
                    />
                </DrawerFormLayout>
            </form>
        </Form>
    )
}

export function RaceFormDrawer({ open, onOpenChange, ...rest }: Props) {
    const [submitting, setSubmitting] = useState(false)

    return (
        <Drawer
            open={open}
            dismissible={!submitting}
            onOpenChange={(next) => {
                if (!submitting || next) onOpenChange(next)
            }}
        >
            <DrawerContent
                data-testid="race-form-drawer"
                className="h-[90dvh] max-h-[90dvh] w-full bg-paper md:h-full md:max-h-none md:max-w-xl"
            >
                <RaceFormBody
                    {...rest}
                    onClose={() => onOpenChange(false)}
                    onSubmittingChange={setSubmitting}
                />
            </DrawerContent>
        </Drawer>
    )
}
