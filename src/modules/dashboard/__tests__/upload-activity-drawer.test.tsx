import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UploadActivityDrawer } from '@/modules/dashboard/upload-activity-drawer'

type Props = { upload?: (form: FormData) => Promise<Response>; onUploaded?: () => void }

const BANNER =
    'Accepted formats: FIT, TCX and GPX (up to 10 MB). FIT is the best choice for Hyrox: it keeps the laps, so your stations can be matched. TCX merges the laps and GPX has none. On Strava, the recommended option is "Export Original".'

type Body = { activityId: string } | { error: string }

const json = (body: Body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function open(props: Props = {}) {
    render(<UploadActivityDrawer {...props} />)
    fireEvent.click(screen.getByTestId('upload-activity-button'))
    await screen.findByTestId('upload-format-banner')
}

async function choose(file: File) {
    await act(async () => {
        fireEvent.change(screen.getByTestId('upload-file-input'), { target: { files: [file] } })
    })
}

const fit = () => new File(['data'], 'run.fit')

describe('UploadActivityDrawer', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // jsdom has no matchMedia, which vaul reads on mount.
        // SAFETY: only the members vaul reads are implemented.
        window.matchMedia = ((query: string) => ({
            matches: false,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
            onchange: null,
        })) as typeof window.matchMedia
    })

    it('opens from the trigger and shows the exact banner copy', async () => {
        await open()
        expect(screen.getByTestId('upload-format-banner')).toHaveTextContent(BANNER)
    })

    it('uses the shared form drawer header and footer', async () => {
        await open()
        expect(screen.getByTestId('drawer-form-title')).toHaveTextContent('Upload activity')
        expect(screen.getByTestId('upload-close')).toBeInTheDocument()
        expect(screen.getByTestId('upload-cancel')).toBeInTheDocument()
        expect(screen.getByTestId('upload-submit')).toBeInTheDocument()
        expect(screen.getByTestId('drawer-form-footer')).toHaveClass('flex-col', 'md:flex-row')
        expect(screen.getByTestId('drawer-form-footer')).toHaveClass('w-full')
        expect(screen.getByTestId('upload-cancel')).toHaveClass('w-full', 'md:flex-1')
        expect(screen.getByTestId('drawer-form-primary-action')).toHaveClass(
            'w-full',
            'md:flex-1',
            '[&>button]:w-full'
        )
    })

    it('closes from the header close control', async () => {
        await open()
        fireEvent.click(screen.getByTestId('upload-close'))
        await waitFor(() =>
            expect(screen.getByTestId('upload-activity-button')).toHaveAttribute(
                'data-state',
                'closed'
            )
        )
    })

    it('keeps submit disabled until a valid file is chosen', async () => {
        await open()
        expect(screen.getByTestId('upload-submit')).toBeDisabled()
        await choose(fit())
        expect(screen.getByTestId('upload-submit')).toBeEnabled()
        expect(screen.getByTestId('upload-file-name')).toHaveTextContent('run.fit')
    })

    it('rejects an unsupported extension immediately', async () => {
        await open()
        await choose(new File(['x'], 'notes.txt'))
        expect(await screen.findByTestId('upload-file-error')).toBeInTheDocument()
        expect(screen.getByTestId('upload-submit')).toBeDisabled()
    })

    it('rejects a file over 10 MB immediately', async () => {
        await open()
        const big = new File(['x'], 'big.fit')
        Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 })
        await choose(big)
        expect(await screen.findByTestId('upload-file-error')).toBeInTheDocument()
        expect(screen.getByTestId('upload-submit')).toBeDisabled()
    })

    it('hides the Hyrox checkbox for gpx', async () => {
        await open()
        await choose(fit())
        expect(screen.getByTestId('upload-hyrox-checkbox')).toBeInTheDocument()
        await choose(new File(['<gpx/>'], 'run.GPX'))
        expect(screen.queryByTestId('upload-hyrox-checkbox')).not.toBeInTheDocument()
    })

    it('checks the box for a tcx mentioning HYROX', async () => {
        await open()
        await choose(new File(['<Notes>hyrox day</Notes>'], 'run.tcx'))
        await waitFor(() =>
            expect(screen.getByTestId('upload-hyrox-checkbox')).toHaveAttribute(
                'aria-checked',
                'true'
            )
        )
    })

    it('disables submit and keeps the drawer open while uploading', async () => {
        let resolve: (r: Response) => void = () => {}
        const upload = vi.fn(() => new Promise<Response>((r) => (resolve = r)))
        await open({ upload })
        await choose(fit())
        fireEvent.click(screen.getByTestId('upload-submit'))
        await waitFor(() => expect(screen.getByTestId('upload-submit')).toBeDisabled())
        expect(screen.getByTestId('upload-close')).toBeDisabled()
        expect(screen.getByTestId('upload-cancel')).toBeDisabled()
        expect(screen.getByTestId('upload-format-banner')).toBeInTheDocument()
        await act(async () => resolve(json({ activityId: 'a1' })))
    })

    it('shows the server error and keeps the file', async () => {
        const upload = vi.fn(async () => json({ error: 'Duplicate file' }, 409))
        await open({ upload })
        await choose(fit())
        fireEvent.click(screen.getByTestId('upload-submit'))
        expect(await screen.findByTestId('upload-error')).toHaveTextContent('Duplicate file')
        expect(screen.getByTestId('upload-file-name')).toHaveTextContent('run.fit')
    })

    it('does not run onUploaded when the upload fails', async () => {
        const upload = vi.fn(async () => json({ error: 'Duplicate file' }, 409))
        const onUploaded = vi.fn()
        await open({ upload, onUploaded })
        await choose(fit())
        fireEvent.click(screen.getByTestId('upload-submit'))
        await screen.findByTestId('upload-error')
        expect(onUploaded).not.toHaveBeenCalled()
        expect(screen.getByTestId('upload-error')).toHaveAttribute('role', 'alert')
        expect(screen.getByTestId('upload-file-input')).toHaveAttribute(
            'aria-label',
            'Activity file'
        )
    })

    it('shows a generic error for a non JSON response', async () => {
        const upload = vi.fn(async () => new Response('boom', { status: 500 }))
        await open({ upload })
        await choose(fit())
        fireEvent.click(screen.getByTestId('upload-submit'))
        expect(await screen.findByTestId('upload-error')).toHaveTextContent(
            'Something went wrong. Try again.'
        )
    })

    it('closes and runs onUploaded on success, sending hyrox only when checked', async () => {
        const upload = vi.fn(async (_form: FormData) => json({ activityId: 'a1' }))
        const onUploaded = vi.fn()
        await open({ upload, onUploaded })
        await choose(fit())
        fireEvent.click(screen.getByTestId('upload-submit'))
        await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
        // vaul keeps the node mounted for its exit animation, so assert the closed state.
        await waitFor(() =>
            expect(screen.getByTestId('upload-activity-button')).toHaveAttribute(
                'data-state',
                'closed'
            )
        )
        const sent = upload.mock.calls[0]![0]
        const sentFile = sent.get('file')
        expect(sentFile instanceof File && sentFile.name).toBe('run.fit')
        expect(sent.has('hyrox')).toBe(false)
    })

    it('sends hyrox=true when checked', async () => {
        const upload = vi.fn(async (_form: FormData) => json({ activityId: 'a1' }))
        await open({ upload })
        await choose(fit())
        fireEvent.click(screen.getByTestId('upload-hyrox-checkbox'))
        fireEvent.click(screen.getByTestId('upload-submit'))
        await waitFor(() => expect(upload).toHaveBeenCalled())
        expect(upload.mock.calls[0]![0].get('hyrox')).toBe('true')
    })

    it('toggles the checkbox from its label text', async () => {
        await open()
        await choose(fit())
        fireEvent.click(screen.getByTestId('upload-hyrox-label'))
        expect(screen.getByTestId('upload-hyrox-checkbox')).toHaveAttribute('aria-checked', 'true')
    })

    it('shows the generic error when the upload rejects', async () => {
        const upload = vi.fn(async () => {
            throw new Error('offline')
        })
        await open({ upload })
        await choose(fit())
        fireEvent.click(screen.getByTestId('upload-submit'))
        expect(await screen.findByTestId('upload-error')).toHaveTextContent(
            'Something went wrong. Try again.'
        )
    })

    it('starts clean after closing with an error', async () => {
        const upload = vi.fn(async () => json({ error: 'Duplicate file' }, 409))
        await open({ upload })
        await choose(fit())
        fireEvent.click(screen.getByTestId('upload-submit'))
        await screen.findByTestId('upload-error')
        fireEvent.click(screen.getByTestId('upload-cancel'))
        await waitFor(() =>
            expect(screen.getByTestId('upload-activity-button')).toHaveAttribute(
                'data-state',
                'closed'
            )
        )
        fireEvent.click(screen.getByTestId('upload-activity-button'))
        await screen.findByTestId('upload-format-banner')
        expect(screen.queryByTestId('upload-error')).not.toBeInTheDocument()
        expect(screen.queryByTestId('upload-file-name')).not.toBeInTheDocument()
        expect(screen.getByTestId('upload-submit')).toBeDisabled()
    })
})
