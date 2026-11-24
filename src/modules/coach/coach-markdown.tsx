import type { ComponentProps } from 'react'
import Markdown from 'react-markdown'

type Props = { content: string }

function ExternalLink({ href, children }: ComponentProps<'a'>) {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
        </a>
    )
}

// No raw HTML (react-markdown escapes it), no images, and the default URL filter drops
// javascript: links. Links open in a new tab without opener access.
const DISALLOWED = ['img']

export function CoachMarkdown({ content }: Props) {
    return (
        <Markdown disallowedElements={DISALLOWED} unwrapDisallowed components={{ a: ExternalLink }}>
            {content}
        </Markdown>
    )
}
