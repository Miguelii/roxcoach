'use client'

import { IconBrandStrava, IconCheck, IconRefresh } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { AvailabilityEditor } from '@/modules/settings/availability-editor'

type FieldProps = {
    label: string
    children: React.ReactNode
}

function Field({ label, children }: FieldProps) {
    return (
        <label className="grid gap-1.5 text-sm font-medium">
            {label}
            {children}
        </label>
    )
}

function ProfileTab() {
    return (
        <div className="max-w-2xl space-y-4 rounded-[var(--radius-surface)] border border-ink/10 bg-card p-5">
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Display name">
                    <Input defaultValue="Miguel" />
                </Field>
                <Field label="Timezone">
                    <Input defaultValue="Europe/Lisbon" />
                </Field>
                <Field label="Max heart rate">
                    <Input defaultValue="190" inputMode="numeric" />
                </Field>
                <Field label="Resting heart rate">
                    <Input defaultValue="52" inputMode="numeric" />
                </Field>
                <Field label="Hyrox division">
                    <Input defaultValue="Open, men" />
                </Field>
                <Field label="Weekly hours cap">
                    <Input defaultValue="7" inputMode="decimal" />
                </Field>
            </div>
            <Field label="Notes for the coach">
                <Textarea
                    rows={3}
                    defaultValue="Left calf gets tight after long runs. Prefer morning sessions on weekends."
                />
            </Field>
            <Button variant="ink" onClick={() => toast.success('Mockup: profile saved')}>
                Save profile
            </Button>
        </div>
    )
}

function StravaTab() {
    return (
        <div className="max-w-2xl space-y-4 rounded-[var(--radius-surface)] border border-ink/10 bg-card p-5">
            <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-tangerine text-on-brand">
                    <IconBrandStrava className="size-5" />
                </span>
                <div>
                    <p className="font-semibold">Strava</p>
                    <p className="flex items-center gap-1 text-xs text-green-deep">
                        <IconCheck className="size-3.5" /> Connected as Miguel G.
                    </p>
                </div>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                    <dt className="eyebrow text-muted-foreground">Last sync</dt>
                    <dd className="font-mono">12 min ago</dd>
                </div>
                <div>
                    <dt className="eyebrow text-muted-foreground">Activities</dt>
                    <dd className="font-mono">214 stored</dd>
                </div>
                <div>
                    <dt className="eyebrow text-muted-foreground">Scopes</dt>
                    <dd className="font-mono">read, activity:read_all</dd>
                </div>
            </dl>
            <p className="text-sm text-muted-foreground">
                New activities arrive by webhook within a minute. Use Sync now if one is missing.
            </p>
            <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => toast('Mockup: sync started')}>
                    <IconRefresh /> Sync now
                </Button>
                <Button variant="destructive" onClick={() => toast('Mockup: disconnected')}>
                    Disconnect
                </Button>
            </div>
            <p className="border-t border-hairline pt-3 text-xs text-muted-foreground">
                Compatible with Strava. Your activities stay in your account and are only used to
                coach you.
            </p>
        </div>
    )
}

export function SettingsView() {
    return (
        <Tabs defaultValue="availability">
            <TabsList>
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="availability">Weekly availability</TabsTrigger>
                <TabsTrigger value="strava">Strava</TabsTrigger>
            </TabsList>
            <TabsContent value="profile">
                <ProfileTab />
            </TabsContent>
            <TabsContent value="availability">
                <AvailabilityEditor />
            </TabsContent>
            <TabsContent value="strava">
                <StravaTab />
            </TabsContent>
        </Tabs>
    )
}
