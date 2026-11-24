'use client'

import { useState, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type TabValue = 'profile' | 'dashboard' | 'availability' | 'integrations'

type Props = {
    profile: ReactNode
    dashboard: ReactNode
    availability: ReactNode
    integrations: ReactNode
}

const isTabValue = (value: unknown): value is TabValue =>
    value === 'profile' ||
    value === 'dashboard' ||
    value === 'availability' ||
    value === 'integrations'

// A panel mounts when its tab is first opened (so the tabs the athlete never opens fetch nothing)
// and then stays mounted, so unsaved edits survive switching tabs.
export function SettingsTabs({ profile, dashboard, availability, integrations }: Props) {
    const [visited, setVisited] = useState<ReadonlySet<TabValue>>(new Set(['profile']))
    const open = (value: TabValue) => visited.has(value)

    return (
        <Tabs
            defaultValue="profile"
            data-testid="settings-tabs"
            onValueChange={(value) => {
                if (isTabValue(value)) setVisited((current) => new Set(current).add(value))
            }}
        >
            <TabsList>
                <TabsTrigger value="profile" data-testid="settings-tab-profile">
                    Profile
                </TabsTrigger>
                <TabsTrigger value="dashboard" data-testid="settings-tab-dashboard">
                    Dashboard
                </TabsTrigger>
                <TabsTrigger value="availability" data-testid="settings-tab-availability">
                    Availability
                </TabsTrigger>
                <TabsTrigger value="integrations" data-testid="settings-tab-integrations">
                    Integrations
                </TabsTrigger>
            </TabsList>
            <TabsContent value="profile" keepMounted>
                {open('profile') ? profile : null}
            </TabsContent>
            <TabsContent value="dashboard" keepMounted>
                {open('dashboard') ? dashboard : null}
            </TabsContent>
            <TabsContent value="availability" keepMounted>
                {open('availability') ? availability : null}
            </TabsContent>
            <TabsContent value="integrations" keepMounted>
                {open('integrations') ? integrations : null}
            </TabsContent>
        </Tabs>
    )
}
