// What the shared Sync button needs to know about one integration.
export type SyncSource = {
    id: string
    name: string
    status: 'loading' | 'error' | 'disconnected' | 'connected'
    lastSyncedAt: string | null
    isSyncing: boolean
    sync: () => Promise<void>
}
