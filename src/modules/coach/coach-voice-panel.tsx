import { Loader2Icon, MicIcon, PauseIcon, SendIcon, Trash2Icon } from 'lucide-react'
import { formatClock } from '@/_bff/core/utils/formatters.utils'
import { Button } from '@/components/ui/button'
import { LEVEL_HISTORY, type useVoiceRecorder } from '@/modules/coach/use-voice-recorder'

type Props = { voice: ReturnType<typeof useVoiceRecorder> }

const BAR_MIN_PX = 4
const BAR_MAX_PX = 28
// Speech rarely goes past a third of full scale, so levels are stretched to use the bar height.
const LEVEL_GAIN = 3

const barHeight = (level: number) =>
    `${Math.round(Math.max(BAR_MIN_PX, Math.min(BAR_MAX_PX, level * LEVEL_GAIN * BAR_MAX_PX)))}px`

export function CoachVoicePanel({ voice }: Props) {
    if (!voice.supported || voice.state === 'idle') return null
    const paused = voice.state === 'paused'
    const live = voice.state === 'recording' || paused
    const finishing = voice.state === 'finishing' || voice.state === 'transcribing'
    const emptySlots = Math.max(0, LEVEL_HISTORY - voice.levels.length)

    return (
        <div
            data-testid="coach-voice-panel"
            className="border-t border-hairline px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[translate] duration-200 ease-out starting:translate-y-full motion-reduce:transition-none md:hidden"
        >
            <div className="flex items-center justify-between gap-4">
                <span data-testid="coach-voice-panel-timer" className="text-2xl tabular-nums">
                    {formatClock(voice.seconds)}
                </span>
                <div
                    data-testid="coach-voice-waveform"
                    aria-hidden="true"
                    className="flex h-8 min-w-0 items-center justify-end gap-[3px] overflow-hidden"
                >
                    {Array.from({ length: emptySlots }, (_, slot) => (
                        <span
                            key={`empty-${slot}`}
                            className="size-1 shrink-0 rounded-full bg-muted-foreground/40"
                        />
                    ))}
                    {voice.levels.map((level, bar) => (
                        <span
                            // oxlint-disable-next-line react/no-array-index-key -- bars are positions in a sliding window, not items
                            key={bar}
                            data-testid="coach-voice-bar"
                            className="w-[3px] shrink-0 rounded-full bg-muted-foreground"
                            style={{ height: barHeight(level) }}
                        />
                    ))}
                </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label="Discard recording"
                    data-testid="coach-voice-discard"
                    onClick={voice.cancel}
                >
                    <Trash2Icon className="size-6" />
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11 rounded-full border-2 border-destructive text-destructive"
                    aria-label={paused ? 'Resume recording' : 'Pause recording'}
                    data-testid="coach-voice-pause"
                    disabled={!live}
                    onClick={paused ? voice.resume : voice.pause}
                >
                    {paused ? <MicIcon /> : <PauseIcon />}
                </Button>
                <Button
                    type="button"
                    size="icon"
                    className="size-12 rounded-full"
                    aria-label="Send voice message"
                    aria-busy={finishing}
                    data-testid="coach-voice-send"
                    disabled={!live}
                    onClick={() => voice.finish('send')}
                >
                    {finishing ? (
                        <Loader2Icon
                            data-testid="coach-voice-send-spinner"
                            className="animate-spin"
                        />
                    ) : (
                        <SendIcon />
                    )}
                </Button>
            </div>
        </div>
    )
}
