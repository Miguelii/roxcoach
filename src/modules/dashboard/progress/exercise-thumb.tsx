import Image from 'next/image'
import { IconBarbell } from '@tabler/icons-react'

type Props = {
    imageUrl: string | null
    // The picture gets `<testId>-image` and the placeholder `<testId>-placeholder`.
    testId: string
}

export function ExerciseThumb({ imageUrl, testId }: Props) {
    return (
        <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-hairline bg-background">
            {imageUrl ? (
                <Image
                    data-testid={`${testId}-image`}
                    src={imageUrl}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-contain p-0.5"
                />
            ) : (
                <IconBarbell
                    data-testid={`${testId}-placeholder`}
                    className="size-5 text-muted-foreground"
                    aria-hidden="true"
                />
            )}
        </span>
    )
}
