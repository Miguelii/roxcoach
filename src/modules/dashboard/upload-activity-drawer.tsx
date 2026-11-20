'use client'

import { Loader2Icon, UploadIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer'
import { DrawerFormLayout } from '@/components/ui/drawer-form-layout'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useUploadActivity } from '@/modules/activity/use-upload-activity'

type Props = {
    upload?: (form: FormData) => Promise<Response>
    onUploaded?: () => void
}

const BANNER =
    'Accepted formats: FIT, TCX and GPX (up to 10 MB). FIT is the best choice for Hyrox: it keeps the laps, so your stations can be matched. TCX merges the laps and GPX has none.'

const formatSize = (bytes: number) =>
    bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
        : `${Math.ceil(bytes / 1024)} KB`

export function UploadActivityDrawer({ upload, onUploaded }: Props) {
    const [open, setOpen] = useState(false)
    const {
        form,
        file,
        submit,
        selectFile,
        setHyrox,
        reset,
        inputKey,
        status,
        errorMessage,
        showHyroxOption,
    } = useUploadActivity({
        upload,
        onSuccess: () => {
            setOpen(false)
            onUploaded?.()
        },
    })
    const uploading = status === 'uploading'

    return (
        <Drawer
            open={open}
            dismissible={!uploading}
            onOpenChange={(next) => {
                if (uploading) return
                if (!next) reset()
                setOpen(next)
            }}
        >
            <DrawerTrigger asChild>
                <Button data-testid="upload-activity-button" className="w-full md:max-w-37.5">
                    <UploadIcon />
                    Upload activity
                </Button>
            </DrawerTrigger>
            <DrawerContent
                data-testid="upload-activity-drawer"
                className="h-[90dvh] max-h-[90dvh] w-full bg-paper md:h-full md:max-h-none md:max-w-xl"
            >
                <Form {...form}>
                    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
                        <DrawerFormLayout
                            title="Upload activity"
                            description="Add a workout file exported from your watch or Strava."
                            closeLabel="Close upload drawer"
                            closeTestId="upload-close"
                            cancelTestId="upload-cancel"
                            closeDisabled={uploading}
                            onDismiss={() => {
                                if (uploading) return
                                reset()
                                setOpen(false)
                            }}
                            primaryAction={
                                <Button
                                    type="submit"
                                    data-testid="upload-submit"
                                    disabled={!form.formState.isValid || uploading}
                                >
                                    {uploading ? <Loader2Icon className="animate-spin" /> : null}
                                    Upload
                                </Button>
                            }
                        >
                            <p
                                data-testid="upload-format-banner"
                                className="rounded-md border bg-muted p-3 text-sm text-muted-foreground"
                            >
                                {BANNER}
                            </p>
                            <FormField
                                control={form.control}
                                name="file"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            <Input
                                                key={inputKey}
                                                type="file"
                                                aria-label="Activity file"
                                                accept=".fit,.tcx,.gpx"
                                                data-testid="upload-file-input"
                                                name={field.name}
                                                ref={field.ref}
                                                onBlur={field.onBlur}
                                                onChange={(event) =>
                                                    void selectFile(event.target.files?.[0])
                                                }
                                            />
                                        </FormControl>
                                        {file ? (
                                            <p
                                                data-testid="upload-file-name"
                                                className="text-xs text-muted-foreground"
                                            >
                                                {file.name} ({formatSize(file.size)})
                                            </p>
                                        ) : null}
                                        <FormMessage data-testid="upload-file-error" />
                                    </FormItem>
                                )}
                            />
                            {showHyroxOption ? (
                                <FormField
                                    control={form.control}
                                    name="hyrox"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <label className="flex items-center gap-2 text-sm">
                                                    <Checkbox
                                                        data-testid="upload-hyrox-checkbox"
                                                        checked={field.value}
                                                        onCheckedChange={setHyrox}
                                                    />
                                                    <span data-testid="upload-hyrox-label">
                                                        This is a Hyrox session
                                                    </span>
                                                </label>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            ) : null}
                            {status === 'error' && errorMessage ? (
                                <p
                                    role="alert"
                                    data-testid="upload-error"
                                    className="text-sm text-destructive"
                                >
                                    {errorMessage}
                                </p>
                            ) : null}
                        </DrawerFormLayout>
                    </form>
                </Form>
            </DrawerContent>
        </Drawer>
    )
}
