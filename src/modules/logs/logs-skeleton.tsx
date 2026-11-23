import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function LogsSkeleton() {
    return (
        <div data-testid="logs-skeleton" className="space-y-4" aria-busy="true">
            <Skeleton className="h-11 w-full rounded-full md:h-10 md:w-96" />
            <Card className="p-4">
                <Skeleton className="h-40 w-full md:h-48" />
            </Card>
            <Skeleton className="h-9 w-2/3 rounded-full" />
            <Card className="py-0">
                {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} className="m-3 h-8" />
                ))}
            </Card>
        </div>
    )
}
