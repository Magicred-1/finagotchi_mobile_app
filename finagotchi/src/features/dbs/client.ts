import {
    authedGet,
    authedPost,
    authedDelete,
} from '../quest-engine/client';

export interface DbsCheckin {
    checkinDate: string;
    createdAt: number;
}

export interface DbsStreakFreeze {
    wallet: string;
    count: number;
    freezeLastUsedAt: number | null;
    updatedAt: number | null;
}

export interface DbsLeague {
    wallet: string;
    score: number;
    currentTier: string;
    seasonId: string | null;
    updatedAt: number | null;
}

export interface DbsLeaderboardEntry {
    wallet: string;
    score: number;
    displayName: string;
    tier: string;
    isFriend?: boolean;
    updatedAt?: number;
}

export interface DbsLeaderboardResponse {
    global: DbsLeaderboardEntry[];
    friends: DbsLeaderboardEntry[];
    own: DbsLeaderboardEntry | null;
}

function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function recordCheckin(wallet: string): Promise<DbsCheckin> {
    const res = (await authedPost('/dbs/checkins', { wallet, checkinDate: todayKey() }, wallet)) as {
        wallet: string;
        checkinDate: string;
        inserted: boolean;
    };
    return { checkinDate: res.checkinDate, createdAt: Date.now() };
}

export async function fetchCheckins(wallet: string): Promise<DbsCheckin[]> {
    const res = (await authedGet('/dbs/checkins', { wallet }, wallet)) as {
        checkins: DbsCheckin[];
    };
    return res.checkins;
}

export async function fetchStreakFreeze(wallet: string): Promise<DbsStreakFreeze> {
    const res = (await authedGet('/dbs/streak-freeze', { wallet }, wallet)) as DbsStreakFreeze;
    return res;
}

export async function addStreakFreezes(wallet: string, amount: number): Promise<DbsStreakFreeze> {
    const res = (await authedPost('/dbs/streak-freeze/add', { wallet, amount }, wallet)) as DbsStreakFreeze;
    return res;
}

export async function useStreakFreezeOnServer(wallet: string, date: string): Promise<DbsStreakFreeze> {
    const res = (await authedPost('/dbs/streak-freeze/use', { wallet, date }, wallet)) as {
        wallet: string;
        date: string;
        used: boolean;
        remaining: number;
    };
    return { wallet, count: res.remaining, freezeLastUsedAt: Date.now(), updatedAt: Date.now() };
}

export async function addLeagueScore(wallet: string, amount: number): Promise<DbsLeague> {
    const res = (await authedPost('/dbs/league/add', { wallet, amount }, wallet)) as DbsLeague;
    return res;
}

export async function fetchLeague(wallet: string): Promise<DbsLeague> {
    const res = (await authedGet('/dbs/league', { wallet }, wallet)) as DbsLeague;
    return res;
}

export async function fetchLeaderboard(wallet: string): Promise<DbsLeaderboardResponse> {
    const res = (await authedGet('/dbs/leaderboard', { wallet }, wallet)) as {
        global: DbsLeaderboardEntry[];
        friends: DbsLeaderboardEntry[];
        own: DbsLeaderboardEntry | null;
    };
    return res;
}

export async function upsertLeaderboardEntry(
    wallet: string,
    displayName: string,
    score: number,
    isFriend: boolean
): Promise<void> {
    await authedPost('/dbs/leaderboard', { wallet, displayName, score, isFriend }, wallet);
}

export async function deleteLeaderboardEntry(wallet: string): Promise<void> {
    await authedDelete('/dbs/leaderboard', { wallet }, wallet);
}

export interface DbsPetState {
    wallet: string;
    stage: number;
    substage: number;
    streak: number;
    mood: string;
    points: number;
    happy: number;
    updatedAt: number | null;
}

export type PetStatePayload = Omit<DbsPetState, 'wallet' | 'updatedAt'>;

export async function pushPetState(
    wallet: string,
    state: PetStatePayload
): Promise<void> {
    await authedPost('/dbs/pet-state', { wallet, ...state }, wallet);
}

export async function fetchPetState(wallet: string): Promise<DbsPetState> {
    const res = (await authedGet('/dbs/pet-state', { wallet }, wallet)) as DbsPetState;
    return res;
}

/**
 * Issue a long-lived device token bound to this wallet. The raw token is
 * returned once (the server stores only its hash) and is meant to be
 * provisioned onto the hardware device alongside the Wi-Fi credentials.
 */
export async function requestDeviceToken(wallet: string): Promise<string> {
    const res = (await authedPost('/device/pair', { wallet }, wallet)) as {
        wallet: string;
        token: string;
    };
    return res.token;
}
