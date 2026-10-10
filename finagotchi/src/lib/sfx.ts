/**
 * Tiny UI sound effects (dialog pops, action taps).
 *
 * expo-audio is a native module: app installs that receive this JS via an
 * OTA update but were built before the module was added don't have it, so
 * every entry point here fails silently — SFX must never crash the UI.
 *
 * Plays at default audio mode: no sound in silent mode / no ducking of
 * other audio (the pop is ~110 ms), which keeps it tasteful by default.
 */

type AudioPlayerLike = {
    volume: number;
    seekTo: (seconds: number) => void;
    play: () => void;
};

let player: AudioPlayerLike | null = null;
let unavailable = false;

function getPlayer(): AudioPlayerLike | null {
    if (player || unavailable) return player;
    try {
        // Lazy require: the JS bundle loads on old native binaries too;
        // createAudioPlayer throws there and we go permanently silent.
        const { createAudioPlayer } = require('expo-audio');
        player = createAudioPlayer(require('../../assets/pop.wav'));
        return player;
    } catch {
        unavailable = true;
        return null;
    }
}

/** Short bubble pop. `volume` scales the shared player's gain (0–1). */
export function playPop(volume = 0.7): void {
    try {
        const p = getPlayer();
        if (!p) return;
        p.volume = volume;
        p.seekTo(0);
        p.play();
    } catch {
        // SFX is decorative — never crash on load/play failure.
    }
}
