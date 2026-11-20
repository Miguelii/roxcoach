// Desktop preference: "0" hides the coach launcher bar. Absent or any other value shows it.
// A cookie (not localStorage) so the server layout can render the right state with no flash.
export const COACH_ENABLED_COOKIE = 'coach_enabled'
export const COACH_ENABLED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
