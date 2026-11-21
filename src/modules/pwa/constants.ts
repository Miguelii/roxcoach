// Where the dismissal is kept (this browser only): JSON with the time it happened (epoch ms) and
// the build it happened on.
export const INSTALL_PROMPT_DISMISSED_KEY = 'roxcoach:install-prompt-dismissed'

// A dismissal goes stale after this long, or on a new build, and the sheet is offered again.
export const INSTALL_PROMPT_DISMISS_TTL_MS = 72 * 60 * 60 * 1000

// A short pause after opening the app, so the sheet does not cover the page while it loads.
export const INSTALL_PROMPT_DELAY_MS = 1500
