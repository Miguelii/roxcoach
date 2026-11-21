// Where the dismissal is kept (this browser only): the time it happened, in epoch milliseconds.
export const INSTALL_PROMPT_DISMISSED_KEY = 'roxcoach:install-prompt-dismissed'

// A dismissal goes stale after this long and the sheet is offered again.
export const INSTALL_PROMPT_DISMISS_TTL_MS = 72 * 60 * 60 * 1000

// A short pause after opening the app, so the sheet does not cover the page while it loads.
export const INSTALL_PROMPT_DELAY_MS = 1500
