// Common IANA zones for the profile select. A saved zone outside this list is added by the form.
export const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'Europe/Lisbon', label: 'Lisbon (Europe/Lisbon)' },
    { value: 'Europe/London', label: 'London (Europe/London)' },
    { value: 'Europe/Madrid', label: 'Madrid (Europe/Madrid)' },
    { value: 'Europe/Paris', label: 'Paris (Europe/Paris)' },
    { value: 'Europe/Berlin', label: 'Berlin (Europe/Berlin)' },
    { value: 'Europe/Athens', label: 'Athens (Europe/Athens)' },
    { value: 'America/Sao_Paulo', label: 'Sao Paulo (America/Sao_Paulo)' },
    { value: 'America/New_York', label: 'New York (America/New_York)' },
    { value: 'America/Chicago', label: 'Chicago (America/Chicago)' },
    { value: 'America/Los_Angeles', label: 'Los Angeles (America/Los_Angeles)' },
    { value: 'Asia/Dubai', label: 'Dubai (Asia/Dubai)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (Asia/Tokyo)' },
    { value: 'Australia/Sydney', label: 'Sydney (Australia/Sydney)' },
]
