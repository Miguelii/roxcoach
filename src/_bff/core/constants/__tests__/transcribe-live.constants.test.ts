import { describe, expect, it } from 'vitest'
import {
    liveSetupMessage,
    liveSocketUrl,
    liveTokenRequestBody,
} from '@/_bff/core/constants/transcribe-live.constants'

describe('live transcription config', () => {
    it('builds the setup message from the docs', () => {
        expect(liveSetupMessage()).toEqual({
            setup: {
                model: 'models/gemini-3.5-transcribe-live',
                generationConfig: { responseModalities: ['TEXT'] },
                inputAudioTranscription: { languageCodes: [], mode: 'SMART' },
            },
        })
    })

    it('opens the constrained socket, the only one that accepts an ephemeral token', () => {
        expect(liveSocketUrl('a b')).toBe(
            'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=a%20b'
        )
    })

    it('builds a one-use token request locked to the live model and config', () => {
        const now = new Date('2026-11-26T10:00:00.000Z')
        expect(liveTokenRequestBody(now)).toEqual({
            uses: 1,
            newSessionExpireTime: '2026-11-26T10:01:00.000Z',
            expireTime: '2026-11-26T10:10:00.000Z',
            bidiGenerateContentSetup: liveSetupMessage().setup,
        })
    })
})
