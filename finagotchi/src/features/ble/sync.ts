import { useEffect, useRef } from 'react';
import { create } from 'zustand';

import type { StateId } from '../../engine/engine';
import { EXPRESSIONS, type PetMood } from '../../engine/expressions';
import type { PetReaction } from '../../components/PetCanvas';
import { useCheckinStore } from '../checkin/store';
import {
    usePetStore,
    type PetAccessory,
    type PetStage,
} from '../pet/store';
import type { FinagotchiBle } from './types';

/** App lifecycle stage → firmware stage name (matches PetCanvas mapping). */
export const STAGE_TO_STATE_ID: Record<PetStage, StateId> = {
    1: 'egg',
    2: 'coinling',
    3: 'coinling',
    4: 'hodler',
    5: 'whale',
};

/** Firmware stage name → app stage (contract: egg=1, coinling=2, hodler=4, whale=5). */
const STATE_ID_TO_STAGE: Record<StateId, PetStage> = {
    egg: 1,
    coinling: 2,
    hodler: 4,
    whale: 5,
};

const STATE_ORDER: StateId[] = ['egg', 'coinling', 'hodler', 'whale'];

/** Next app stage along egg → coinling → hodler → whale, or null at whale. */
export function nextEvolutionStage(stage: PetStage): PetStage | null {
    const index = STATE_ORDER.indexOf(STAGE_TO_STATE_ID[stage]);
    if (index < 0 || index >= STATE_ORDER.length - 1) return null;
    return STATE_ID_TO_STAGE[STATE_ORDER[index + 1]];
}

/** Firmware mood id = index into EXPRESSIONS (see firmware BLE contract). */
export const MOODS = EXPRESSIONS.map((expression, index) => ({
    id: expression.id,
    index,
}));

export function moodIndex(mood: PetMood): number {
    return EXPRESSIONS.findIndex((e) => e.id === mood);
}

export function moodByIndex(index: number): PetMood | null {
    return EXPRESSIONS[index]?.id ?? null;
}

/** Firmware item id → accessory (contract: 0 none … 5 diamond). */
const ACCESSORIES: PetAccessory[] = [
    'none',
    'crown',
    'glasses',
    'bowtie',
    'halo',
    'diamond',
];

export function accessoryIndex(accessory: PetAccessory): number {
    return Math.max(0, ACCESSORIES.indexOf(accessory));
}

export function accessoryByIndex(index: number): PetAccessory | null {
    return ACCESSORIES[index] ?? null;
}

/**
 * Device-side control state. `lastSentStage`/`lastSentMood`/`lastSentItem`/
 * `lastSentPoints`/`lastSentHappy`/`lastSentStreak` record what the app pushed
 * to the device so the firmware's echo of our own writes is never applied back
 * as a "device-initiated" change (the app is authoritative while connected —
 * the firmware pauses its demo auto-evolve).
 */
export const useDeviceControlStore = create<{
    /** Mood override from the mood picker or a device-initiated change. */
    deviceMood: PetMood | null;
    lastSentStage: PetStage | null;
    lastSentMood: number | null;
    lastSentItem: number | null;
    lastSentPoints: number | null;
    lastSentHappy: number | null;
    lastSentStreak: number | null;
    setDeviceMood: (mood: PetMood | null) => void;
    /** Mood picker: set the local expression and record the push. */
    pushMood: (mood: PetMood) => void;
}>((set) => ({
    deviceMood: null,
    lastSentStage: null,
    lastSentMood: null,
    lastSentItem: null,
    lastSentPoints: null,
    lastSentHappy: null,
    lastSentStreak: null,
    setDeviceMood: (mood) => set({ deviceMood: mood }),
    pushMood: (mood) => set({ deviceMood: mood, lastSentMood: moodIndex(mood) }),
}));

/**
 * Mirrors pet state between the app engine and the device. While connected
 * the app is authoritative (the firmware pauses its demo auto-evolve):
 *
 * - On connect: push a `stage:<n>;mood:<m>;item:<i>;points:<p>;happy:<h>;streak:<s>`
 *   snapshot. Points persist on the device (NVS), but happiness is RAM-only,
 *   so the stats must be re-shared on every connect for the on-device stats
 *   bar to match the app.
 * - On local stage/accessory/mood change: write `stage:<n>` / `item:<i>` /
 *   `mood:<m>`.
 * - On local balance/happiness/streak change: write `points:<p>` /
 *   `happy:<h>` / `streak:<s>`.
 * - On reaction: write `react:<name>`.
 * - On device notification: apply `stage:`/`mood:`/`item:`/`streak:` back into
 *   the local engine only when the device genuinely initiated the change —
 *   never for the connect-time state snapshot or echoes of our own pushes.
 *
 * `currentMood` is the app's current engine mood; `reaction`/`reactionKey`
 * are the PetCanvas reaction currently playing.
 */
export function useDeviceSync(
    ble: FinagotchiBle,
    currentMood: PetMood,
    reaction?: PetReaction,
    reactionKey?: number | string
) {
    const connected = ble.connectedDevice !== null;
    // Guard so state applied from a notification is not echoed straight back.
    const applyingRemote = useRef(false);
    // The first notification after connect is the firmware's pre-push state
    // snapshot, not a device-initiated change: skip it once.
    const skipInitialState = useRef(false);
    const currentMoodRef = useRef(currentMood);
    currentMoodRef.current = currentMood;

    const sendCommandRef = useRef(ble.sendCommand);
    sendCommandRef.current = ble.sendCommand;

    // On connect: push app state to the device. On disconnect: reset.
    useEffect(() => {
        if (!connected) {
            skipInitialState.current = false;
            useDeviceControlStore.setState({
                deviceMood: null,
                lastSentStage: null,
                lastSentMood: null,
                lastSentItem: null,
                lastSentPoints: null,
                lastSentHappy: null,
                lastSentStreak: null,
            });
            return;
        }

        const pet = usePetStore.getState();
        const mood = moodIndex(currentMoodRef.current);
        const item = accessoryIndex(pet.accessory);
        const points = Math.round(pet.balance);
        const happy = Math.round(pet.happiness);
        const streak = useCheckinStore.getState().streak;

        skipInitialState.current = true;
        useDeviceControlStore.setState({
            lastSentStage: pet.stage,
            lastSentMood: mood,
            lastSentItem: item,
            lastSentPoints: points,
            lastSentHappy: happy,
            lastSentStreak: streak,
        });
        // Happiness is RAM-only on the device and points drive its stats bar,
        // so stats are part of every connect snapshot, not just on change.
        sendCommandRef.current(
            `stage:${pet.stage};mood:${mood};item:${item};points:${points};happy:${happy};streak:${streak}`
        );
    }, [connected]);

    // Local stage changes → write stage:<n> to the device.
    useEffect(
        () =>
            usePetStore.subscribe((state, prev) => {
                if (applyingRemote.current) return;

                if (state.stage !== prev.stage) {
                    if (state.stage === useDeviceControlStore.getState().lastSentStage) {
                        return;
                    }
                    useDeviceControlStore.setState({ lastSentStage: state.stage });
                    sendCommandRef.current(`stage:${state.stage}`);
                }

                if (state.accessory !== prev.accessory) {
                    const item = accessoryIndex(state.accessory);
                    if (item === useDeviceControlStore.getState().lastSentItem) {
                        return;
                    }
                    useDeviceControlStore.setState({ lastSentItem: item });
                    sendCommandRef.current(`item:${item}`);
                }

                // Stats bar on the device: points persist in NVS, happiness is
                // RAM-only — both follow the app's balance/happiness.
                if (state.balance !== prev.balance) {
                    const points = Math.round(state.balance);
                    if (points !== useDeviceControlStore.getState().lastSentPoints) {
                        useDeviceControlStore.setState({ lastSentPoints: points });
                        sendCommandRef.current(`points:${points}`);
                    }
                }

                if (state.happiness !== prev.happiness) {
                    const happy = Math.round(state.happiness);
                    if (happy !== useDeviceControlStore.getState().lastSentHappy) {
                        useDeviceControlStore.setState({ lastSentHappy: happy });
                        sendCommandRef.current(`happy:${happy}`);
                    }
                }
            }),
        []
    );

    // Local streak changes (check-in, freeze, reset) → streak:<n> so the
    // device stats bar shows the app's streak while the app is authoritative.
    useEffect(
        () =>
            useCheckinStore.subscribe((state, prev) => {
                if (applyingRemote.current) return;
                if (state.streak === prev.streak) return;
                if (state.streak === useDeviceControlStore.getState().lastSentStreak) {
                    return;
                }
                useDeviceControlStore.setState({ lastSentStreak: state.streak });
                sendCommandRef.current(`streak:${state.streak}`);
            }),
        []
    );

    // Engine mood changes → write mood:<id>. The mood picker pushes directly
    // and records lastSentMood, so this only fires for computed mood changes;
    // it also clears any picker/device override so app and device agree.
    useEffect(() => {
        if (!connected) return;
        const mood = moodIndex(currentMood);
        if (mood === useDeviceControlStore.getState().lastSentMood) return;
        useDeviceControlStore.setState({ lastSentMood: mood, deviceMood: null });
        sendCommandRef.current(`mood:${mood}`);
    }, [connected, currentMood]);

    // PetCanvas reactions → react:<name> on the device.
    useEffect(() => {
        if (!connected || !reaction) return;
        sendCommandRef.current(`react:${reaction}`);
    }, [connected, reaction, reactionKey]);

    // Device notifications → apply genuinely device-initiated stage/mood/item
    // changes to the local engine. Echoes of our own pushes are ignored.
    useEffect(() => {
        const state = ble.deviceState;
        if (!connected || !state) return;

        if (skipInitialState.current) {
            skipInitialState.current = false;
            return;
        }

        const { lastSentStage, lastSentMood, lastSentItem, lastSentStreak } =
            useDeviceControlStore.getState();

        applyingRemote.current = true;
        try {
            const remoteStage = STATE_ID_TO_STAGE[state.stage as StateId];
            // Compare on the firmware stage name, not the app number: app
            // stages 2 and 3 are both "coinling" on the device, so a numeric
            // comparison would misread our own echo as a downgrade.
            const lastSentName = lastSentStage
                ? STAGE_TO_STATE_ID[lastSentStage]
                : null;
            if (remoteStage && state.stage !== lastSentName) {
                if (usePetStore.getState().stage !== remoteStage) {
                    usePetStore.setState({ stage: remoteStage });
                }
                useDeviceControlStore.setState({ lastSentStage: remoteStage });
            }

            if (state.mood !== lastSentMood) {
                const mood = moodByIndex(state.mood);
                if (mood) {
                    useDeviceControlStore.getState().setDeviceMood(mood);
                }
                useDeviceControlStore.setState({ lastSentMood: state.mood });
            }

            if (state.item !== lastSentItem) {
                const accessory = accessoryByIndex(state.item);
                if (accessory && usePetStore.getState().accessory !== accessory) {
                    usePetStore.setState({ accessory });
                }
                useDeviceControlStore.setState({ lastSentItem: state.item });
            }

            // Device-computed streak (day rollover) → streak display. Echoes
            // of our own `streak:` pushes are ignored via lastSentStreak.
            if (state.streak !== lastSentStreak) {
                useDeviceControlStore.setState({ lastSentStreak: state.streak });
                if (state.streak !== useCheckinStore.getState().streak) {
                    useCheckinStore.setState({ streak: state.streak });
                }
            }
        } finally {
            applyingRemote.current = false;
        }
    }, [connected, ble.deviceState]);
}
