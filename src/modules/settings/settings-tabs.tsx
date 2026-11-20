'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Props = {
    profile: ReactNode
    availability: ReactNode
    lyfta: ReactNode
}

export function SettingsTabs({ profile, availability, lyfta }: Props) {
    return (
        <Tabs defaultValue="profile" data-testid="settings-tabs">
            <TabsList>
                <TabsTrigger value="profile" data-testid="settings-tab-profile">
                    Profile
                </TabsTrigger>
                <TabsTrigger value="availability" data-testid="settings-tab-availability">
                    Weekly availability
                </TabsTrigger>
                <TabsTrigger value="lyfta" data-testid="settings-tab-lyfta">
                    Lyfta
                </TabsTrigger>
            </TabsList>
            {/* Both panels stay mounted so unsaved edits survive switching tabs. */}
            <TabsContent value="profile" keepMounted>
                {profile}
            </TabsContent>
            <TabsContent value="availability" keepMounted>
                {availability}
            </TabsContent>
            <TabsContent value="lyfta" keepMounted>
                {lyfta}
            </TabsContent>
        </Tabs>
    )
}
