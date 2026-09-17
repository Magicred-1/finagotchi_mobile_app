import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type PetStage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type PetBackground = 'default' | 'aurora' | 'sunset' | 'midnight' | 'galaxy' | 'gold';
export type PetAccessory = 'none' | 'crown' | 'glasses' | 'bowtie' | 'halo' | 'diamond' | 'tshirt';

export const BACKGROUND_COLORS: Record<PetBackground, readonly [string, string]> = {
    default: ['rgba(93,226,166,0.06)', 'rgba(93,226,166,0.12)'],
    aurora: ['rgba(53,215,255,0.08)', 'rgba(192,140,255,0.14)'],
    sunset: ['rgba(255,142,158,0.08)', 'rgba(255,193,94,0.14)'],
    midnight: ['rgba(30,41,59,0.5)', 'rgba(53,215,255,0.10)'],
    galaxy: ['rgba(99,50,180,0.18)', 'rgba(53,215,255,0.14)'],
    gold: ['rgba(255,193,94,0.14)', 'rgba(255,142,74,0.12)'],
};

export const STAGE_NAMES: Record<PetStage, string> = {
    1: 'Egg',
    2: 'Hatching',
    3: 'Hatchling',
    4: 'Tiny Saver',
    5: 'Coinling',
    6: 'Staker',
    7: 'Saver',
    8: 'HODLer',
    9: 'Disciplined',
    10: 'Accumu-whale',
    11: 'Alpha Whale',
    12: 'Whale • Legend',
};

export const STAGE_THRESHOLDS = [0, 1, 2, 3, 5, 7, 14, 30, 60, 90, 120, 180];

/** XP required to go from `level` to `level + 1`. Single source for the curve. */
export function xpForNextLevel(level: number): number {
    return level * 100;
}

/** The creature dies of neglect when the life timer runs out. */
export const LIFE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Life time granted per completed quest. Quests extend the timer by this
 * amount (capped at LIFE_DURATION_MS) instead of resetting it, so quests
 * support the creature but a daily check-in remains the strongest way to
 * keep it alive.
 */
export const QUEST_LIFE_BONUS_MS = 24 * 60 * 60 * 1000;

/** Progressive revive window: 1st death 30 min, 2nd 2 hours, 3rd+ 5 hours. */
export const REVIVE_COOLDOWNS_MS = [
    30 * 60 * 1000,
    2 * 60 * 60 * 1000,
    5 * 60 * 60 * 1000,
];

/** Free care actions (caress) are capped per calendar day. */
export const FREE_ACTION_DAILY_LIMIT = 10;

/** Friends a user must invite to earn a free revive after death. */
export const REVIVE_INVITES_REQUIRED = 2;

export type CauseOfDeath = 'starvation' | 'neglect';

type DailyFreeUses = {
    date: string;
    count: number;
};

type PetState = {
    stage: PetStage;
    totalCheckins: number;
    name: string | null;
    mintAddress: string | null;
    mintedAt: string | null;
    lastCelebratedStage: PetStage;
    evolvedAt: string | null;
    background: PetBackground;
    accessory: PetAccessory;
    /** Spendable points balance. Earned by caring for the creature; spent on actions and collectibles. */
    balance: number;
    ownedBackgrounds: PetBackground[];
    ownedAccessories: PetAccessory[];
    /** 0-100 happiness. Decays when the creature is bored and restores when fed or played with. */
    happiness: number;
    /** ISO date of the last time the creature was fed (check-in). */
    lastFedAt: string | null;
    /** ISO date of the last time the creature was engaged (fed, played, trained, caressed). */
    lastInteractionAt: string | null;
    /** ISO watermark up to which happiness decay has been applied. */
    lastHappinessDecayAt: string | null;
    /** True when the creature has died. Blocks normal interaction until revived. */
    isDead: boolean;
    /** True when the creature is in spectral (soft-death) form. Alias for isDead kept for clarity. */
    isSpectral: boolean;
    /** How many times the creature has died. Drives the progressive revive cooldown. */
    deathCount: number;
    /** ISO date of death. */
    deathAt: string | null;
    /** Why the creature died. */
    causeOfDeath: CauseOfDeath | null;
    /** ISO date when the paid revive window closes. */
    reviveWindowEndsAt: string | null;
    /** ISO date when the 7-day life timer expires. */
    lifeTimerEndsAt: string | null;
    /** ISO date when the hired guardian expires. */
    guardianExpiresAt: string | null;
    /** XP earned from quests and care. Drives level progression. */
    xp: number;
    /** Current player level. Unlocks cosmetics, foods, and boosts. */
    level: number;
    /** Consumable revive tokens (free remint). */
    reviveTokens: number;
    /** Consumable streak freezes. */
    streakFreezes: number;
    /** Friends invited toward a free revive. Reset on death and on revive. */
    reviveInvites: number;
    /** Tracks free care actions used today. */
    dailyFreeUses: DailyFreeUses;

    getStage: () => PetStage;
    setCreatureName: (name: string) => void;
    mintCreature: (name: string, mintAddress: string) => void;
    setLastCelebratedStage: (stage: PetStage) => void;
    setCosmetic: (patch: Partial<Pick<PetState, 'background' | 'accessory'>>) => void;
    /** Add to the spendable balance. */
    addBalance: (amount: number) => void;
    /** Spend balance if enough is available. Returns true on success. */
    spendBalance: (amount: number) => boolean;
    /** Purchase a background if affordable and not already owned. Returns true on success. */
    purchaseBackground: (id: PetBackground, price: number) => boolean;
    /** Purchase an accessory if affordable and not already owned. Returns true on success. */
    purchaseAccessory: (id: PetAccessory, price: number) => boolean;
    /** Own a background without spending (e.g. streak unlocks). */
    ownBackground: (id: PetBackground) => void;
    /** Own an accessory without spending (e.g. streak unlocks). */
    ownAccessory: (id: PetAccessory) => void;
    /** Feed the creature, giving a happiness boost and resetting the 7-day life timer. */
    feedPet: () => void;
    /** Restore a flat amount of happiness. */
    boostHappiness: (amount: number) => void;
    /** Reduce happiness by a flat amount, clamped to 0. */
    reduceHappiness: (amount: number) => void;
    /** Decay happiness for each hour since the last interaction. */
    decayHappiness: () => void;
    /**
     * Attempt to use a free care action for today.
     * Returns true if within the daily limit, false otherwise.
     */
    useFreeAction: () => boolean;
    /**
     * Kill the creature. Instead of burning the NFT, the creature becomes
     * spectral (soft-death). The mint address is preserved and a progressive
     * revive window is opened based on deathCount.
     */
    killCreature: (cause: CauseOfDeath) => void;
    /**
     * Revive the creature from spectral form.
     * @param resetProgress - If true, reset level/stage progress as a hard penalty.
     */
    reviveCreature: (resetProgress?: boolean) => void;
    /** Whether the paid revive window is still open. */
    isReviveWindowActive: () => boolean;
    /** Time remaining in the revive window, in ms. */
    getReviveWindowRemainingMs: () => number;
    /** Check the 7-day life timer and kill the creature if it expired. */
    checkLifeTimer: () => void;
    /** Time remaining on the 7-day life timer, in ms. */
    getLifeTimerRemainingMs: () => number;
    /**
     * Effective time remaining on the life timer, reduced when the creature is
     * sad. Used for both the UI countdown and the actual death check.
     */
    getEffectiveLifeTimerRemainingMs: () => number;
    /** Add XP and check for level up. */
    addXp: (amount: number) => void;
    /**
     * Apply a server-verified reward (the server is the payout authority).
     * Points mirror XP 1:1 and land in the spendable balance; XP drives level.
     */
    applyServerGrant: (grant: { xp: number; points: number }) => void;
    /** Buy a revive token with balance. */
    buyReviveToken: (price: number) => boolean;
    /** Buy a streak freeze with balance. */
    buyStreakFreeze: (price: number) => boolean;
    /** Hire a guardian to keep the creature alive while you are away. */
    hireGuardian: (hours: number, price: number) => boolean;
    /** Whether a guardian is currently active. */
    isGuardianActive: () => boolean;
    /** Time remaining on the guardian timer, in ms. */
    getGuardianRemainingMs: () => number;
    /** Reset the life timer to its full duration (e.g. a daily check-in). */
    resetLifeTimer: () => void;
    /** Extend the life timer by QUEST_LIFE_BONUS_MS, capped at full duration (e.g. a quest was completed). */
    extendLifeTimer: () => void;
    /** Count one more friend invited toward a free revive. */
    addReviveInvite: () => void;
};

function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function reviveWindowMs(deathCount: number): number {
    return REVIVE_COOLDOWNS_MS[Math.min(Math.max(0, deathCount - 1), REVIVE_COOLDOWNS_MS.length - 1)];
}

export const usePetStore = create<PetState>()(
    persist(
        (set, get) => ({
            stage: 1,
            totalCheckins: 0,
            name: null,
            mintAddress: null,
            mintedAt: null,
            lastCelebratedStage: 1,
            evolvedAt: null,
            background: 'default',
            accessory: 'none',
            balance: 750,
            ownedBackgrounds: ['default'],
            ownedAccessories: ['none'],
            happiness: 100,
            lastFedAt: null,
            lastInteractionAt: null,
            lastHappinessDecayAt: null,
            isDead: false,
            isSpectral: false,
            deathCount: 0,
            deathAt: null,
            causeOfDeath: null,
            reviveWindowEndsAt: null,
            lifeTimerEndsAt: null,
            guardianExpiresAt: null,
            xp: 0,
            level: 1,
            reviveTokens: 1,
            streakFreezes: 1,
            reviveInvites: 0,
            dailyFreeUses: { date: todayKey(), count: 0 },

            getStage: () => get().stage,

            setCreatureName: (name) => {
                set({ name: name.trim() || null });
            },

            mintCreature: (name, mintAddress) => {
                const now = new Date().toISOString();
                set({
                    name: name.trim() || null,
                    mintAddress,
                    mintedAt: now,
                    stage: 1,
                    lastCelebratedStage: 1,
                    evolvedAt: now,
                    happiness: 100,
                    lastInteractionAt: now,
                    lastHappinessDecayAt: now,
                    lifeTimerEndsAt: new Date(
                        Date.now() + LIFE_DURATION_MS
                    ).toISOString(),
                    isDead: false,
                    isSpectral: false,
                    deathCount: 0,
                    deathAt: null,
                    causeOfDeath: null,
                    reviveWindowEndsAt: null,
                    guardianExpiresAt: null,
                });
            },

            setLastCelebratedStage: (stage) => {
                set({ lastCelebratedStage: stage });
            },

            setCosmetic: (patch) => {
                set(patch);
            },

            addBalance: (amount) => {
                set({ balance: get().balance + Math.max(0, amount) });
            },

            spendBalance: (amount) => {
                const current = get().balance;
                const cost = Math.max(0, amount);
                if (cost > current) return false;
                set({ balance: current - cost });
                return true;
            },

            purchaseBackground: (id, price) => {
                const state = get();
                if (state.ownedBackgrounds.includes(id)) return true;
                const cost = Math.max(0, price);
                if (cost > state.balance) return false;
                set({
                    balance: state.balance - cost,
                    ownedBackgrounds: [...state.ownedBackgrounds, id],
                });
                return true;
            },

            purchaseAccessory: (id, price) => {
                const state = get();
                if (state.ownedAccessories.includes(id)) return true;
                const cost = Math.max(0, price);
                if (cost > state.balance) return false;
                set({
                    balance: state.balance - cost,
                    ownedAccessories: [...state.ownedAccessories, id],
                });
                return true;
            },

            ownBackground: (id) => {
                const state = get();
                if (state.ownedBackgrounds.includes(id)) return;
                set({ ownedBackgrounds: [...state.ownedBackgrounds, id] });
            },

            ownAccessory: (id) => {
                const state = get();
                if (state.ownedAccessories.includes(id)) return;
                set({ ownedAccessories: [...state.ownedAccessories, id] });
            },

            feedPet: () => {
                const now = new Date().toISOString();
                set({
                    happiness: Math.min(100, get().happiness + 20),
                    lastFedAt: now,
                    lastInteractionAt: now,
                    lastHappinessDecayAt: now,
                    lifeTimerEndsAt: new Date(
                        Date.now() + LIFE_DURATION_MS
                    ).toISOString(),
                });
            },

            boostHappiness: (amount) => {
                const now = new Date().toISOString();
                set({
                    happiness: Math.min(100, get().happiness + Math.max(0, amount)),
                    lastInteractionAt: now,
                    lastHappinessDecayAt: now,
                });
            },

            reduceHappiness: (amount) => {
                set({ happiness: Math.max(0, get().happiness - Math.max(0, amount)) });
            },

            decayHappiness: () => {
                const { lastInteractionAt, lastHappinessDecayAt, happiness, isDead } = get();
                if (isDead || !lastInteractionAt || happiness <= 0) return;

                const now = Date.now();
                // Consume whole hours since the decay watermark. Without it,
                // the per-second tick would re-charge the same elapsed hours
                // and drain happiness to 0 almost immediately.
                const checkpoint = new Date(
                    lastHappinessDecayAt ?? lastInteractionAt
                ).getTime();
                const hoursSince = Math.floor(
                    (now - checkpoint) / (1000 * 60 * 60)
                );

                if (hoursSince > 0) {
                    const decay = hoursSince * 5;
                    set({
                        happiness: Math.max(0, happiness - decay),
                        lastHappinessDecayAt: new Date(
                            checkpoint + hoursSince * 1000 * 60 * 60
                        ).toISOString(),
                    });
                }
            },

            useFreeAction: () => {
                const state = get();
                const today = todayKey();
                const current = state.dailyFreeUses.date === today ? state.dailyFreeUses.count : 0;
                if (current >= FREE_ACTION_DAILY_LIMIT) return false;
                set({
                    dailyFreeUses: { date: today, count: current + 1 },
                    lastInteractionAt: new Date().toISOString(),
                });
                return true;
            },

            killCreature: (cause) => {
                const now = new Date();
                const nextDeathCount = get().deathCount + 1;
                const windowEnds = new Date(now.getTime() + reviveWindowMs(nextDeathCount));
                set({
                    happiness: 0,
                    isDead: true,
                    isSpectral: true,
                    deathCount: nextDeathCount,
                    deathAt: now.toISOString(),
                    causeOfDeath: cause,
                    reviveWindowEndsAt: windowEnds.toISOString(),
                    reviveInvites: 0,
                    // NFT is not burned; mintAddress is preserved.
                });
            },

            reviveCreature: (resetProgress = false) => {
                const now = new Date();
                const state = get();
                set({
                    happiness: 100,
                    isDead: false,
                    isSpectral: false,
                    deathAt: null,
                    causeOfDeath: null,
                    reviveWindowEndsAt: null,
                    reviveInvites: 0,
                    mintAddress: state.mintAddress,
                    mintedAt: resetProgress ? now.toISOString() : state.mintedAt,
                    stage: resetProgress ? 1 : state.stage,
                    lastCelebratedStage: resetProgress ? 1 : state.lastCelebratedStage,
                    evolvedAt: resetProgress ? now.toISOString() : state.evolvedAt,
                    totalCheckins: resetProgress ? 0 : state.totalCheckins,
                    lastFedAt: now.toISOString(),
                    lastInteractionAt: now.toISOString(),
                    lastHappinessDecayAt: now.toISOString(),
                    lifeTimerEndsAt: new Date(
                        now.getTime() + LIFE_DURATION_MS
                    ).toISOString(),
                    xp: resetProgress ? 0 : state.xp,
                    level: resetProgress ? 1 : state.level,
                });
            },

            isReviveWindowActive: () => {
                const end = get().reviveWindowEndsAt;
                if (!end) return false;
                return new Date(end).getTime() > Date.now();
            },

            getReviveWindowRemainingMs: () => {
                const end = get().reviveWindowEndsAt;
                if (!end) return 0;
                return Math.max(0, new Date(end).getTime() - Date.now());
            },

            checkLifeTimer: () => {
                const state = get();
                if (state.isDead) return;
                if (state.isGuardianActive()) return;

                if (!state.lifeTimerEndsAt) {
                    set({
                        lifeTimerEndsAt: new Date(
                            Date.now() + LIFE_DURATION_MS
                        ).toISOString(),
                    });
                    return;
                }

                if (state.getEffectiveLifeTimerRemainingMs() <= 0) {
                    get().killCreature('neglect');
                }
            },

            getLifeTimerRemainingMs: () => {
                const end = get().lifeTimerEndsAt;
                if (!end) return LIFE_DURATION_MS;
                return Math.max(0, new Date(end).getTime() - Date.now());
            },

            getEffectiveLifeTimerRemainingMs: () => {
                const raw = get().getLifeTimerRemainingMs();
                const { happiness } = get();
                // Sadness malus: at 0 happiness the timer drains ~2.5x faster,
                // at 100 happiness there is no malus.
                const multiplier = 0.4 + (happiness / 100) * 0.6;
                return Math.max(0, raw * multiplier);
            },

            addXp: (amount) => {
                let { xp, level } = get();
                xp += Math.max(0, amount);
                // Loop so a grant larger than one level's threshold still
                // levels up repeatedly instead of eating the overflow.
                while (xp >= xpForNextLevel(level)) {
                    xp -= xpForNextLevel(level);
                    level += 1;
                }
                set({ xp, level });
            },

            applyServerGrant: ({ xp, points }) => {
                if (points > 0) get().addBalance(points);
                if (xp > 0) get().addXp(xp);
            },

            buyReviveToken: (price) => {
                const state = get();
                if (state.balance < price) return false;
                set({
                    balance: state.balance - price,
                    reviveTokens: state.reviveTokens + 1,
                });
                return true;
            },

            buyStreakFreeze: (price) => {
                const state = get();
                if (state.balance < price) return false;
                set({
                    balance: state.balance - price,
                    streakFreezes: state.streakFreezes + 1,
                });
                return true;
            },

            hireGuardian: (hours, price) => {
                const state = get();
                if (state.balance < price) return false;
                const now = Date.now();
                const existing = state.guardianExpiresAt
                    ? Math.max(now, new Date(state.guardianExpiresAt).getTime())
                    : now;
                set({
                    balance: state.balance - price,
                    guardianExpiresAt: new Date(
                        existing + hours * 60 * 60 * 1000
                    ).toISOString(),
                });
                return true;
            },

            isGuardianActive: () => {
                const end = get().guardianExpiresAt;
                if (!end) return false;
                return new Date(end).getTime() > Date.now();
            },

            getGuardianRemainingMs: () => {
                const end = get().guardianExpiresAt;
                if (!end) return 0;
                return Math.max(0, new Date(end).getTime() - Date.now());
            },

            resetLifeTimer: () => {
                if (get().isDead) return;
                set({
                    lifeTimerEndsAt: new Date(
                        Date.now() + LIFE_DURATION_MS
                    ).toISOString(),
                });
            },

            extendLifeTimer: () => {
                const state = get();
                if (state.isDead) return;

                const currentEnd = state.lifeTimerEndsAt
                    ? new Date(state.lifeTimerEndsAt).getTime()
                    : Date.now();

                // From wherever the timer currently sits, add the quest
                // bonus but never let it exceed a full life duration.
                const nextEnd = Math.min(
                    Math.max(currentEnd, Date.now()) + QUEST_LIFE_BONUS_MS,
                    Date.now() + LIFE_DURATION_MS
                );

                set({ lifeTimerEndsAt: new Date(nextEnd).toISOString() });
            },

            addReviveInvite: () => {
                set({
                    reviveInvites: Math.min(
                        REVIVE_INVITES_REQUIRED,
                        get().reviveInvites + 1
                    ),
                });
            },
        }),
        {
            name: 'finagotchi-pet',
            storage: createJSONStorage(() => AsyncStorage),
            migrate: (persistedState: unknown) => {
                if (
                    persistedState &&
                    typeof persistedState === 'object'
                ) {
                    const state = persistedState as Record<string, unknown>;
                    const migrated: Record<string, unknown> = { ...state };

                    // Legacy health -> happiness rename.
                    if (!('happiness' in migrated) && 'health' in migrated) {
                        migrated.happiness = migrated.health;
                        delete migrated.health;
                    }

                    // New soft-death / guardian fields.
                    if (typeof migrated.isSpectral !== 'boolean') {
                        migrated.isSpectral = migrated.isDead === true;
                    }
                    if (typeof migrated.deathCount !== 'number') {
                        migrated.deathCount = 0;
                    }
                    if (typeof migrated.guardianExpiresAt !== 'string') {
                        migrated.guardianExpiresAt = null;
                    }
                    if (!migrated.dailyFreeUses || typeof migrated.dailyFreeUses !== 'object') {
                        migrated.dailyFreeUses = { date: todayKey(), count: 0 };
                    }
                    if (typeof migrated.reviveInvites !== 'number') {
                        migrated.reviveInvites = 0;
                    }
                    // Decay watermark: start from the last interaction so
                    // existing pets aren't re-charged for elapsed hours.
                    if (typeof migrated.lastHappinessDecayAt !== 'string') {
                        migrated.lastHappinessDecayAt =
                            typeof migrated.lastInteractionAt === 'string'
                                ? migrated.lastInteractionAt
                                : null;
                    }

                    return migrated as PetState;
                }
                return persistedState as PetState;
            },
        }
    )
);

export function calculateStage(streak: number): PetStage {
    if (streak >= 180) return 12;
    if (streak >= 120) return 11;
    if (streak >= 90) return 10;
    if (streak >= 60) return 9;
    if (streak >= 30) return 8;
    if (streak >= 14) return 7;
    if (streak >= 7) return 6;
    if (streak >= 5) return 5;
    if (streak >= 3) return 4;
    if (streak >= 2) return 3;
    if (streak >= 1) return 2;
    return 1;
}

export function updatePetStage(streak: number) {
    const stage = calculateStage(streak);

    usePetStore.setState({
        stage,
        evolvedAt: new Date().toISOString(),
    });
}

export function feedPet() {
    const now = new Date().toISOString();
    usePetStore.setState((pet) => ({
        happiness: Math.min(100, pet.happiness + 50),
        lastFedAt: now,
        lastInteractionAt: now,
        lastHappinessDecayAt: now,
    }));
}
