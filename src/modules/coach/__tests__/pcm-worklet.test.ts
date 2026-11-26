// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { PCM_WORKLET_NAME, PCM_WORKLET_URL } from '@/modules/coach/pcm-worklet'

describe('PCM worklet', () => {
    it('is served from our own origin and registers the processor the browser deps create', async () => {
        expect(PCM_WORKLET_URL.startsWith('/assets/')).toBe(true)
        const source = await readFile(`public${PCM_WORKLET_URL}`, 'utf8')
        expect(source).toContain(`registerProcessor('${PCM_WORKLET_NAME}'`)
    })
})
