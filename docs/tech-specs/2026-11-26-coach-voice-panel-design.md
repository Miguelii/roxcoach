# Coach voice panel on mobile (design)

Status: approved by the athlete on 2026-11-26. Builds on
[2026-11-26-coach-voice-input-design.md](2026-11-26-coach-voice-input-design.md) (live
transcription with the upload fallback), which stays binding for everything not changed here.

## Intent

On the phone the athlete wants a voice recorder that feels like WhatsApp: tap the mic, a panel
slides up under the message box with the time and a live waveform, and three buttons: discard,
pause and send. Send goes straight to the coach. Desktop keeps the current mic button.

## Goals

- Phones only (below the `md` breakpoint, 768 px): tapping the mic opens the panel under the
  message box. The box above keeps showing the live text, as today.
- Panel, top row: the elapsed time on the left (large, tabular figures), a waveform of the
  microphone level on the right (one bar every 100 ms, sliding left, dots where there is no history
  yet).
- Panel, bottom row: discard (trash, left), pause and resume (red outline circle, centre), send
  (filled circle in the primary color with the send icon, right).
- **Discard** cancels the recording at any point (also while transcribing): the box goes back to
  what was typed before.
- **Pause** freezes the time and the waveform and stops sending audio; the icon becomes a mic to
  resume. The 60 second cap counts recorded time only.
- **Send** stops, waits for the final text (with the upload fallback if needed), then sends the
  whole box (what was typed before plus the transcript) to the coach and clears it. While it waits
  the send button shows a spinner.
- While the panel is open on a phone, the mic and Send buttons of the message row are hidden.
- Touch targets of at least 44 px, labels for screen readers, the slide-up animation off under
  reduced motion.

## Non-goals

- No change on desktop: the mic toggles recording and the text stays in the box for review.
- No hold to talk or swipe to cancel gestures.
- No playback of the recording.

## Anti-goals

- Sending text the athlete did not get: if the transcription fails nothing is sent; any partial
  text stays in the box with the error line, for the athlete to fix and send.
- Two messages at once: if the coach is still answering when the transcript is ready, nothing is
  sent; the text stays in the box, ready to send when the reply ends.

## Constraints

- The live token's `expireTime` grows from 3 to 10 minutes (the Live API's session limit) so a
  pause does not outlive the token. `newSessionExpireTime` stays at 1 minute.
- The waveform is computed from the audio already captured (root mean square of each 100 ms
  chunk), no new browser API.
- Semantic color tokens only: pause uses `destructive`, send uses `primary`, not WhatsApp's green.

## Approaches

1. **One recorder hook, two presentations (chosen).** The hook gains pause, resume, a finish
   intent (`review` or `send`) and the level history; the mobile panel and the desktop button both
   read it. The panel is shown with CSS (`md:hidden`), so the server render and the client agree.
2. **A separate mobile recorder.** Duplicates the live session, the fallback and every edge case
   already tested; rejected.
3. **Choosing the layout with `useIsMobile`.** Renders nothing until hydration and swaps trees on
   rotate; CSS does the same job without a second render path; rejected.

## Decided with the athlete

The panel layout from the WhatsApp screenshot; send goes straight to the coach (changed from
"put the text in the box"); pause keeps the 60 second cap on recorded time; discard restores what
was typed before.

## Calls made by the author

- While a session is paused, nothing is sent over the socket; if Google closes an idle socket, the
  upload fallback runs at send, as for any dropped socket.
- The send button is disabled while the microphone is starting (nothing recorded yet); discard
  stays enabled in every state.
- A failed transcription with partial text leaves that text in the box and does not send it, even
  when the athlete pressed send.
- 40 bars of level history are kept; the panel shows as many as fit.

## Left to the builder

Exact sizes and spacing within the 4 px rhythm, the bar height scale, the slide-up easing.
