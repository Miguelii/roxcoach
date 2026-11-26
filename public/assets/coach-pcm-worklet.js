// Runs on the audio thread, outside the bundler, served from our own origin so the CSP allows it.
// Copies the first channel of each block to the main thread, where it is downsampled. The name
// must match PCM_WORKLET_NAME in src/modules/coach/pcm-worklet.ts.
class CoachPcmCapture extends AudioWorkletProcessor {
    process(inputs) {
        const channel = inputs[0] && inputs[0][0]
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a MessagePort, not a window
        if (channel && channel.length > 0) this.port.postMessage(channel.slice())
        return true
    }
}

registerProcessor('coach-pcm-capture', CoachPcmCapture)
