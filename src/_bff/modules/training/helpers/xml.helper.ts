import { XMLParser } from 'fast-xml-parser'

type Maybe<T> = T | undefined
export type XmlTree = object

const ARRAY_TAGS = new Set(['Activity', 'Lap', 'Track', 'Trackpoint', 'trkpt', 'trkseg', 'trk'])
const PREDEFINED = new Map([
    ['&amp;', '&'],
    ['&lt;', '<'],
    ['&gt;', '>'],
    ['&quot;', '"'],
    ['&apos;', "'"],
])

// Single pass, so "&amp;lt;" decodes to "&lt;" and never further.
const decode = (v: string): string =>
    v.replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => PREDEFINED.get(m) ?? m)

// XML is untrusted input: entity processing is off (no expansion bombs), only the five predefined
// entities are decoded by hand, and namespace prefixes are stripped.
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    processEntities: false,
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: (name) => ARRAY_TAGS.has(name),
    tagValueProcessor: (_name, value) => decode(value),
    attributeValueProcessor: (_name, value) => decode(value),
})

export function parseXml(bytes: Uint8Array): XmlTree {
    const text = new TextDecoder().decode(bytes)
    if (/<!(?:ENTITY|DOCTYPE)/i.test(text)) throw new Error('doctype or entity declaration')
    // SAFETY: the tree is validated by a zod schema in every caller before any field is used.
    return parser.parse(text) as XmlTree
}

export const numOf = (v: Maybe<string>): number | null => {
    if (v === undefined || v.trim() === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

// ISO timestamp to UTC ISO. A value without a zone is read as UTC (the GPX spec).
export const isoOf = (v: Maybe<string>): string | null => {
    if (v === undefined) return null
    const t = v.trim()
    const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(t) || !/T\d/.test(t)
    const ms = Date.parse(zoned ? t : `${t}Z`)
    return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}
