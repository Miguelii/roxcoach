// True when the app runs installed (home screen), not in a browser tab. `navigator.standalone` is
// the iOS Safari flag.
export const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
