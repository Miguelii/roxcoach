/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { detectHyroxHint, useUploadActivity } from '@/modules/activity/use-upload-activity'

type Deferred = { file: File; release: (text: string) => void }

// A tcx file whose first-bytes read resolves only when released.
function deferredTcx(name: string): Deferred {
    let release: (text: string) => void = () => {}
    const pending = new Promise<string>((resolve) => {
        release = resolve
    })
    const file = new File(['x'], name)
    // SAFETY: only text() is read by the hook.
    file.slice = () => ({ text: () => pending }) as Blob
    return { file, release }
}

describe('detectHyroxHint', () => {
    it('matches HYROX case-insensitively', () => {
        expect(detectHyroxHint('<Notes>my Hyrox race</Notes>')).toBe(true)
        expect(detectHyroxHint('HYROX')).toBe(true)
    })

    it('does not match other text', () => {
        expect(detectHyroxHint('<Notes>easy run</Notes>')).toBe(false)
        expect(detectHyroxHint('')).toBe(false)
    })
})

describe('useUploadActivity', () => {
    it('ignores a late tcx read after the file changed', async () => {
        const { result } = renderHook(() => useUploadActivity())
        const first = deferredTcx('a.tcx')
        let reading: Promise<void> = Promise.resolve()
        act(() => {
            reading = result.current.selectFile(first.file)
        })
        await act(async () => {
            await result.current.selectFile(new File(['x'], 'b.fit'))
        })
        await act(async () => {
            first.release('HYROX')
            await reading
        })
        expect(result.current.form.getValues('hyrox')).toBe(false)
    })

    it('does not override a manual choice made before the read resolves', async () => {
        const { result } = renderHook(() => useUploadActivity())
        const tcx = deferredTcx('a.tcx')
        let reading: Promise<void> = Promise.resolve()
        act(() => {
            reading = result.current.selectFile(tcx.file)
        })
        act(() => result.current.setHyrox(false))
        await act(async () => {
            tcx.release('HYROX')
            await reading
        })
        expect(result.current.form.getValues('hyrox')).toBe(false)
    })

    it('uploads once when submit is called twice', async () => {
        let resolve: (r: Response) => void = () => {}
        const upload = vi.fn(
            () =>
                new Promise<Response>((r) => {
                    resolve = r
                })
        )
        const { result } = renderHook(() => useUploadActivity({ upload }))
        await act(async () => {
            await result.current.selectFile(new File(['x'], 'a.fit'))
        })
        await act(async () => {
            const a = result.current.submit()
            const b = result.current.submit()
            await vi.waitFor(() => expect(upload).toHaveBeenCalled())
            resolve(new Response('{}'))
            await Promise.all([a, b])
        })
        expect(upload).toHaveBeenCalledTimes(1)
    })
})
