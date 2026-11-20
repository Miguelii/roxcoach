/** Goal speed in m/s for a distance and a target time, shown through `formatPace`. Running races only. */
export const requiredPaceMps = (distanceM: number, targetTimeS: number): number => {
    if (!(distanceM > 0) || !(targetTimeS > 0)) return 0
    return distanceM / targetTimeS
}
