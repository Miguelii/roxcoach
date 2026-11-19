'use client'

import { IconRefresh } from '@tabler/icons-react'
import { toast } from 'sonner'
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

export function GenerateNowDialog() {
    return (
        <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>
                <IconRefresh /> Generate now
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="display text-3xl">
                        Generate this week&apos;s report?
                    </DialogTitle>
                    <DialogDescription>
                        The coach reviews the week so far, remembers the previous 3 reports and
                        rewrites next week&apos;s planned sessions. Sessions you already marked done
                        or skipped stay as they are. The Sunday report will replace it.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
                    <DialogClose
                        render={<Button variant="ink" />}
                        onClick={() => toast.success('Mockup: report requested')}
                    >
                        Generate
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
