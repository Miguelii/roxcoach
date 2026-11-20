'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Props = {
    profile: ReactNode
    availability: ReactNode
}

export function SettingsTabs({ profile, availability }: Props) {
    return (
        <Tabs defaultValue="profile" data-testid="settings-tabs">
            <TabsList>
                <TabsTrigger value="profile" data-testid="settings-tab-profile">
                    Profile
                </TabsTrigger>
                <TabsTrigger value="availability" data-testid="settings-tab-availability">
                    Weekly availability
                </TabsTrigger>
            </TabsList>
            <TabsContent value="profile">{profile}</TabsContent>
            <TabsContent value="availability">{availability}</TabsContent>
        </Tabs>
    )
}
