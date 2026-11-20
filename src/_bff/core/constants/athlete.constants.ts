// Profile field limits shared by the validation helper, the controller input and the form.
export const PROFILE_LIMITS = {
    nameMaxLength: 60,
    minMaxHr: 120,
    maxMaxHr: 230,
    minRestingHr: 30,
    maxRestingHr: 120,
    weeklyHoursCapMax: 40,
    notesMaxLength: 1000,
} as const
