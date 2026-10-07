import type { PetMood } from '../../components/PetCanvas';

/**
 * The app's computed pet mood — shared by the home screen (what the user
 * sees) and the server state push (what standalone hardware renders), so the
 * two never drift.
 */
export function getMood(
    hour: number,
    hasCheckedInToday: boolean,
    streak: number,
    happiness: number
): PetMood {
    if (happiness <= 0) {
        return 'sad';
    }

    if (happiness < 30) {
        return 'sad';
    }

    if (hour >= 22 || hour <= 7) {
        return 'sleeping';
    }

    if (hasCheckedInToday) {
        if (streak >= 7) {
            return 'proud';
        }
        return 'happy';
    }

    return 'waiting';
}
