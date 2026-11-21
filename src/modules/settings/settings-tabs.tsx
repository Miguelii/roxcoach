'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Props = {
    profile: ReactNode
    dashboard: ReactNode
    availability: ReactNode
    integrations: ReactNode
}

export function SettingsTabs({ profile, dashboard, availability, integrations }: Props) {
    return (
        <Tabs defaultValue="profile" data-testid="settings-tabs">
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
            {/* The panels stay mounted so unsaved edits survive switching tabs. */}
            <TabsContent value="profile" keepMounted>
                {profile}
            </TabsContent>
            <TabsContent value="dashboard" keepMounted>
                {dashboard}
            </TabsContent>
            <TabsContent value="availability" keepMounted>
                {availability}
            </TabsContent>
            <TabsContent value="integrations" keepMounted>
                {integrations}
            </TabsContent>
        </Tabs>
    )
}
