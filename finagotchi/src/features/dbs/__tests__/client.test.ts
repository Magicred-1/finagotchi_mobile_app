import { describe, expect, it, vi, afterEach } from 'vitest';
import { recordCheckin, fetchCheckins, addStreakFreezes, fetchLeaderboard, setProfileName, setProfileUsername, addFriend, removeFriend, searchUsers, pushPetState } from '../client';

const { mockedClient } = vi.hoisted(() => {
    return { mockedClient: { authedGet: vi.fn(), authedPost: vi.fn(), authedDelete: vi.fn() } };
});

vi.mock('../../quest-engine/client', () => mockedClient);

describe('dbs client', () => {
    afterEach(() => {
        vi.resetAllMocks();
    });

    it('records a checkin for today', async () => {
        mockedClient.authedPost.mockResolvedValueOnce({ wallet: 'abc', checkinDate: '2026-09-17', inserted: true });
        const res = await recordCheckin('abc');
        expect(res.checkinDate).toBe('2026-09-17');
        expect(mockedClient.authedPost).toHaveBeenCalledWith('/dbs/checkins', expect.objectContaining({ wallet: 'abc' }), 'abc');
    });

    it('fetches checkins', async () => {
        mockedClient.authedGet.mockResolvedValueOnce({ checkins: [{ checkinDate: '2026-09-17', createdAt: 1 }] });
        const res = await fetchCheckins('abc');
        expect(res).toHaveLength(1);
        expect(mockedClient.authedGet).toHaveBeenCalledWith('/dbs/checkins', { wallet: 'abc' }, 'abc');
    });

    it('adds streak freezes', async () => {
        mockedClient.authedPost.mockResolvedValueOnce({ wallet: 'abc', count: 5, freezeLastUsedAt: null, updatedAt: 1 });
        const res = await addStreakFreezes('abc', 2);
        expect(res.count).toBe(5);
        expect(mockedClient.authedPost).toHaveBeenCalledWith('/dbs/streak-freeze/add', { wallet: 'abc', amount: 2 }, 'abc');
    });

    it('fetches leaderboard', async () => {
        mockedClient.authedGet.mockResolvedValueOnce({ global: [], friends: [] });
        const res = await fetchLeaderboard('abc');
        expect(res.global).toHaveLength(0);
        expect(mockedClient.authedGet).toHaveBeenCalledWith('/dbs/leaderboard', { wallet: 'abc' }, 'abc');
    });

    it('sets the profile name', async () => {
        mockedClient.authedPost.mockResolvedValueOnce({ wallet: 'abc', displayName: 'Finny' });
        await setProfileName('abc', 'Finny');
        expect(mockedClient.authedPost).toHaveBeenCalledWith('/dbs/profile', { wallet: 'abc', displayName: 'Finny' }, 'abc');
    });

    it('sets the profile username', async () => {
        mockedClient.authedPost.mockResolvedValueOnce({ wallet: 'abc', username: 'finny_1' });
        await setProfileUsername('abc', 'finny_1');
        expect(mockedClient.authedPost).toHaveBeenCalledWith('/dbs/profile', { wallet: 'abc', username: 'finny_1' }, 'abc');
    });

    it('adds and removes friends', async () => {
        mockedClient.authedPost.mockResolvedValueOnce({});
        await addFriend('abc', 'def');
        expect(mockedClient.authedPost).toHaveBeenCalledWith('/dbs/friends', { wallet: 'abc', friendWallet: 'def' }, 'abc');

        mockedClient.authedDelete.mockResolvedValueOnce({});
        await removeFriend('abc', 'def');
        expect(mockedClient.authedDelete).toHaveBeenCalledWith('/dbs/friends', { wallet: 'abc', friendWallet: 'def' }, 'abc');
    });

    it('searches users by nickname and returns results', async () => {
        mockedClient.authedGet.mockResolvedValueOnce({
            query: 'fin',
            results: [{ wallet: 'def', displayName: 'Finny' }],
        });
        const res = await searchUsers('abc', 'fin');
        expect(res).toEqual([{ wallet: 'def', displayName: 'Finny' }]);
        expect(mockedClient.authedGet).toHaveBeenCalledWith('/dbs/users/search', { wallet: 'abc', q: 'fin' }, 'abc');
    });
});

describe('pushPetState (CAS)', () => {
    afterEach(() => {
        vi.resetAllMocks();
    });

    const STATE = { stage: 4, streak: 7, mood: 'happy', points: 120, happy: 80 };

    it('sends clientUpdatedAt when known and never sends substage', async () => {
        const row = { wallet: 'abc', ...STATE, updatedAt: 42 };
        mockedClient.authedPost.mockResolvedValueOnce(row);

        const res = await pushPetState('abc', STATE, 41);

        expect(res).toEqual({ applied: true, state: row });
        const payload = mockedClient.authedPost.mock.calls[0][1] as Record<string, unknown>;
        expect(payload).toMatchObject({ wallet: 'abc', ...STATE, clientUpdatedAt: 41 });
        expect(payload).not.toHaveProperty('substage');
    });

    it('omits clientUpdatedAt on the first push', async () => {
        mockedClient.authedPost.mockResolvedValueOnce({ wallet: 'abc', ...STATE, updatedAt: 1 });

        await pushPetState('abc', STATE, null);

        const payload = mockedClient.authedPost.mock.calls[0][1] as Record<string, unknown>;
        expect(payload).not.toHaveProperty('clientUpdatedAt');
    });

    it('on 409 fetches the current row once (server wins), no blind retry', async () => {
        const conflict = new Error('conflict') as Error & { status: number };
        conflict.status = 409;
        mockedClient.authedPost.mockRejectedValueOnce(conflict);
        const serverRow = { wallet: 'abc', stage: 5, streak: 8, mood: 'proud', points: 200, happy: 90, updatedAt: 50 };
        mockedClient.authedGet.mockResolvedValueOnce(serverRow);

        const res = await pushPetState('abc', STATE, 41);

        expect(res).toEqual({ applied: false, conflict: serverRow });
        expect(mockedClient.authedPost).toHaveBeenCalledTimes(1);
        expect(mockedClient.authedGet).toHaveBeenCalledWith('/dbs/pet-state', { wallet: 'abc' }, 'abc');
    });

    it('rethrows non-409 errors', async () => {
        mockedClient.authedPost.mockRejectedValueOnce(new Error('network down'));

        await expect(pushPetState('abc', STATE, 41)).rejects.toThrow('network down');
        expect(mockedClient.authedGet).not.toHaveBeenCalled();
    });
});
