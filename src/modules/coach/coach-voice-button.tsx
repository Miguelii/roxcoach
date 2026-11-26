import { CircleIcon, Loader2Icon, MicIcon } from 'lucide-react'
import { formatClock } from '@/_bff/core/utils/formatters.utils'
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
    starting: 'Waiting for the microphone',
    recording: 'Stop recording',
    paused: 'Stop recording',
    finishing: 'Transcribing',
    transcribing: 'Transcribing',
} as const

export function CoachVoiceButton({ voice }: Props) {
    if (!voice.supported) return null
    // Paused only happens from the phone panel; past the breakpoint it reads as recording.
    const recording = voice.state === 'recording' || voice.state === 'paused'
    // Starting stays tappable: a tap while the permission prompt hangs starts over.
    const busy = voice.state === 'finishing' || voice.state === 'transcribing'

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
                    {formatClock(voice.seconds)}
                </span>
            ) : null}
            <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label={ARIA_LABEL[voice.state]}
                aria-pressed={recording}
                data-testid="coach-voice"
                disabled={busy}
                onClick={voice.toggle}
            >
                {voice.state === 'idle' ? <MicIcon /> : null}
                {recording ? (
                    <CircleIcon
                        data-testid="coach-voice-stop-icon"
                        className="fill-destructive text-destructive"
                    />
                ) : null}
                {voice.state === 'starting' || busy ? (
                    <Loader2Icon className="animate-spin" />
                ) : null}
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
