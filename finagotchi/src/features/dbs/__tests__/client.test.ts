import { describe, expect, it, vi, afterEach } from 'vitest';
import { recordCheckin, fetchCheckins, addStreakFreezes, addLeagueScore, fetchLeaderboard } from '../client';

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

    it('adds league score', async () => {
        mockedClient.authedPost.mockResolvedValueOnce({ wallet: 'abc', score: 100, currentTier: 'bronze' });
        const res = await addLeagueScore('abc', 25);
        expect(res.score).toBe(100);
        expect(mockedClient.authedPost).toHaveBeenCalledWith('/dbs/league/add', { wallet: 'abc', amount: 25 }, 'abc');
    });

    it('fetches leaderboard', async () => {
        mockedClient.authedGet.mockResolvedValueOnce({ global: [], friends: [] });
        const res = await fetchLeaderboard('abc');
        expect(res.global).toHaveLength(0);
        expect(mockedClient.authedGet).toHaveBeenCalledWith('/dbs/leaderboard', { wallet: 'abc' }, 'abc');
    });
});
