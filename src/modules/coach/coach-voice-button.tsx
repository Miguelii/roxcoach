import { Loader2Icon, MicIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { useVoiceRecorder, VoiceErrorKind } from '@/modules/coach/use-voice-recorder'

type Props = { voice: ReturnType<typeof useVoiceRecorder> }

const VOICE_ERROR_COPY: Record<VoiceErrorKind, string> = {
    'mic-blocked': 'Allow microphone access in your browser settings',
    'no-speech': "Didn't catch that. Try again.",
    busy: 'Transcription is busy. Try again in a minute.',
    failed: "Couldn't transcribe. Try again.",
}

const ARIA_LABEL = {
    idle: 'Record a voice message',
    recording: 'Stop recording',
    transcribing: 'Transcribing',
} as const

const formatElapsed = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export function CoachVoiceButton({ voice }: Props) {
    if (!voice.supported) return null
    const recording = voice.state === 'recording'

    return (
        <div className="flex items-center gap-2">
            {recording ? (
                <span
                    data-testid="coach-voice-timer"
                    className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground"
                >
                    <span
                        aria-hidden="true"
                        className="size-2 animate-pulse rounded-full bg-destructive"
                    />
                    {formatElapsed(voice.seconds)}
                </span>
            ) : null}
            <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label={ARIA_LABEL[voice.state]}
                aria-pressed={recording}
                data-testid="coach-voice"
                disabled={voice.state === 'transcribing'}
                onClick={voice.toggle}
            >
                {voice.state === 'idle' ? <MicIcon /> : null}
                {recording ? <SquareIcon /> : null}
                {voice.state === 'transcribing' ? <Loader2Icon className="animate-spin" /> : null}
            </Button>
        </div>
    )
}

export function CoachVoiceError({ voice }: Props) {
    if (voice.error === null) return null
    return (
        <p data-testid="coach-voice-error" className="text-xs text-muted-foreground">
            {VOICE_ERROR_COPY[voice.error]}
        </p>
    )
}
