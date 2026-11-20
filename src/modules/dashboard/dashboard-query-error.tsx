import { Button } from '@/components/ui/button'

type Props = {
    message: string
    onRetry: () => void
    testId: string
}

export function DashboardQueryError({ message, onRetry, testId }: Props) {
    return (
        <div
            data-testid={testId}
            role="alert"
            className="flex flex-wrap items-center gap-3 text-sm text-destructive"
        >
            <p>{message}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
                Try again
            </Button>
        </div>
    )
}
