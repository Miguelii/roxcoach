'use client'

import { FileCheck2Icon, FileUpIcon, Loader2Icon, UploadIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer'
import { DrawerFormLayout } from '@/components/ui/drawer-form-layout'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useUploadActivity } from '@/modules/activity/use-upload-activity'

type Props = {
    upload?: (form: FormData) => Promise<Response>
    onUploaded?: () => void
}

const BANNER =
    'Accepted formats: FIT, TCX and GPX (up to 10 MB). FIT is the best choice for Hyrox: it keeps the laps, so your stations can be matched. TCX merges the laps and GPX has none. On Strava, the recommended option is "Export Original".'

const formatSize = (bytes: number) =>
    bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
        : `${Math.ceil(bytes / 1024)} KB`

export function UploadActivityDrawer({ upload, onUploaded }: Props) {
    const [open, setOpen] = useState(false)
    const [dragOver, setDragOver] = useState(false)
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
                                        <label
                                            data-testid="upload-dropzone"
                                            onDragOver={(event) => {
                                                event.preventDefault()
                                                setDragOver(true)
                                            }}
                                            onDragLeave={() => setDragOver(false)}
                                            onDrop={(event) => {
                                                event.preventDefault()
                                                setDragOver(false)
                                                if (uploading) return
                                                void selectFile(event.dataTransfer.files[0])
                                            }}
                                            className={cn(
                                                'group flex cursor-pointer flex-col items-center gap-3 rounded-[var(--radius-surface-inner)] border border-dashed border-hairline bg-muted/40 px-6 py-8 text-center',
                                                'transition-[transform,background-color,border-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                                                'hover:border-ink/30 hover:bg-muted active:scale-[0.99]',
                                                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                                                (dragOver || file) && 'border-ink/40 bg-muted',
                                                dragOver && 'scale-[1.01]',
                                                uploading && 'pointer-events-none opacity-60'
                                            )}
                                        >
                                            <FormControl>
                                                <Input
                                                    key={inputKey}
                                                    type="file"
                                                    aria-label="Activity file"
                                                    accept=".fit,.tcx,.gpx"
                                                    data-testid="upload-file-input"
                                                    className="sr-only"
                                                    name={field.name}
                                                    ref={field.ref}
                                                    onBlur={field.onBlur}
                                                    onChange={(event) =>
                                                        void selectFile(event.target.files?.[0])
                                                    }
                                                />
                                            </FormControl>
                                            <span className="flex size-12 items-center justify-center rounded-full bg-paper text-ink ring-1 ring-hairline transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-0.5 motion-reduce:transition-none">
                                                {file ? (
                                                    <FileCheck2Icon
                                                        className="size-5"
                                                        strokeWidth={1.5}
                                                    />
                                                ) : (
                                                    <FileUpIcon
                                                        className="size-5"
                                                        strokeWidth={1.5}
                                                    />
                                                )}
                                            </span>
                                            {file ? (
                                                <span
                                                    data-testid="upload-file-name"
                                                    className="max-w-full space-y-0.5"
                                                >
                                                    <span className="block truncate text-sm font-medium text-ink">
                                                        {file.name} ({formatSize(file.size)})
                                                    </span>
                                                    <span className="block text-xs text-muted-foreground">
                                                        Tap to choose a different file
                                                    </span>
                                                </span>
                                            ) : (
                                                <span className="space-y-0.5">
                                                    <span className="block text-sm font-medium text-ink">
                                                        Choose a file or drop it here
                                                    </span>
                                                    <span className="block text-xs text-muted-foreground">
                                                        FIT, TCX or GPX, up to 10 MB
                                                    </span>
                                                </span>
                                            )}
                                        </label>
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
