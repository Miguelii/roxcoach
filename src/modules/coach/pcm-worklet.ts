export const PCM_WORKLET_NAME = 'coach-pcm-capture'

// Runs on the audio thread, outside the bundler, so it is plain JavaScript loaded from a Blob URL.
// It only copies the first channel of each block to the main thread, where it is downsampled.
export const PCM_WORKLET_SOURCE = `
class CoachPcmCapture extends AudioWorkletProcessor {
    process(inputs) {
        const channel = inputs[0] && inputs[0][0]
        if (channel && channel.length > 0) this.port.postMessage(channel.slice())
        return true
    }
}
registerProcessor('${PCM_WORKLET_NAME}', CoachPcmCapture)
`
