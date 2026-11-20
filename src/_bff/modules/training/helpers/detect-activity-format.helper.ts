import type { ActivityFormat } from '@/_bff/modules/training/types'

const FIT_SIGNATURE = '.FIT'

// Detects the format from the content, never from the file name.
export function detectActivityFormat(bytes: Uint8Array): ActivityFormat | null {
    if (bytes.length >= 12) {
        const signature = String.fromCharCode(...bytes.slice(8, 12))
        if (signature === FIT_SIGNATURE) return 'fit'
    }
    const head = new TextDecoder('utf-8').decode(bytes.slice(0, 512)).replace(/^﻿/, '')
    if (/<TrainingCenterDatabase[\s>]/.test(head)) return 'tcx'
    if (/<gpx[\s>]/.test(head)) return 'gpx'
    return null
}
