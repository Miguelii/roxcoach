import Image from 'next/image'
import { IconShare, IconSquarePlus } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer'

type Props = {
    variant: 'native' | 'ios'
    onInstall: () => void
    onDismiss: () => void
}

// The bottom sheet that offers installing the app. Swiping it away or tapping outside counts as
// dismissing it.
export function InstallPromptView({ variant, onInstall, onDismiss }: Props) {
    return (
        <Drawer
            open
            onOpenChange={(next) => {
                if (!next) onDismiss()
            }}
        >
            <DrawerContent data-testid="install-prompt" className="bg-paper">
                <DrawerHeader className="items-center gap-3 pt-2">
                    <Image
                        src="/android-chrome-192x192.png"
                        alt=""
                        width={64}
                        height={64}
                        className="size-16 rounded-[1.1rem] ring-1 ring-ink/10"
                    />
                    <DrawerTitle className="display text-2xl">Install Roxcoach</DrawerTitle>
                    <DrawerDescription data-testid="install-prompt-description">
                        {variant === 'native'
                            ? 'Add it to your home screen to open it full screen, like an app.'
                            : 'Add it to your home screen to open it full screen, like an app. In Safari:'}
                    </DrawerDescription>
                </DrawerHeader>

                {variant === 'ios' ? (
                    <ol data-testid="install-prompt-steps" className="space-y-3 px-6 pb-2 text-sm">
                        <li className="flex items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                                <IconShare className="size-5" aria-hidden="true" />
                            </span>
                            <span>
                                Tap the <strong>Share</strong> button in the browser bar.
                            </span>
                        </li>
                        <li className="flex items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                                <IconSquarePlus className="size-5" aria-hidden="true" />
                            </span>
                            <span>
                                Choose <strong>Add to Home Screen</strong>.
                            </span>
                        </li>
                    </ol>
                ) : null}

                <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
                    {variant === 'native' ? (
                        <Button
                            data-testid="install-prompt-install"
                            className="h-12 w-full"
                            onClick={onInstall}
                        >
                            Install app
                        </Button>
                    ) : null}
                    <Button
                        data-testid="install-prompt-dismiss"
                        variant={variant === 'native' ? 'ghost' : 'default'}
                        className="h-12 w-full"
                        onClick={onDismiss}
                    >
                        {variant === 'native' ? 'Not now' : 'Got it'}
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    )
}
