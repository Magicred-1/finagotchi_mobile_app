/**
 * Device-reported streak → local adoption: a standalone device can
 * legitimately tick a day offline, but it can never legitimately have a LOWER
 * streak than the app — lower/equal reports are stale echoes. Adopt only
 * strictly-greater values.
 */
export function shouldAdoptDeviceStreak(
    deviceStreak: number,
    localStreak: number
): boolean {
    return deviceStreak > localStreak;
}
