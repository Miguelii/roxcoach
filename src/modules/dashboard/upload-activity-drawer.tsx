'use client'

import { Loader2Icon, UploadIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from '@/components/ui/drawer'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useUploadActivity } from '@/modules/dashboard/use-upload-activity'

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
            direction="right"
            open={open}
            onOpenChange={(next) => {
                if (uploading) return
                if (!next) reset()
                setOpen(next)
            }}
        >
            <DrawerTrigger asChild>
                <Button variant="outline" data-testid="upload-activity-button">
                    <UploadIcon />
                    Upload activity
                </Button>
            </DrawerTrigger>
            <DrawerContent>
                <DrawerHeader>
                    <DrawerTitle>Upload activity</DrawerTitle>
                    <DrawerDescription>
                        Add a workout file exported from your watch or Strava.
                    </DrawerDescription>
                </DrawerHeader>
                <Form {...form}>
                    <form onSubmit={submit} className="flex flex-col gap-4 p-4">
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
                        <Button
                            type="submit"
                            data-testid="upload-submit"
                            disabled={!form.formState.isValid || uploading}
                        >
                            {uploading ? <Loader2Icon className="animate-spin" /> : null}
                            Upload
                        </Button>
                    </form>
                </Form>
            </DrawerContent>
        </Drawer>
    )
}
