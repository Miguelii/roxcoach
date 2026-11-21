'use client'

import { LyftaCard } from '@/modules/lyfta/lyfta-card'
import { ZeppCard } from '@/modules/zepp/zepp-card'

export function IntegrationsTab() {
    return (
        <div data-testid="integrations-tab" className="grid gap-10">
            <h2 data-testid="integrations-heading" className="sr-only">
                Integrations
            </h2>
            <LyftaCard />
            <div className="border-t border-ink/10 pt-10">
                <ZeppCard />
            </div>
        </div>
    )
}
