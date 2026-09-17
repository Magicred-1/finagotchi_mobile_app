import { describe, expect, it, vi, afterEach } from 'vitest';
import { registerNftCreature, fetchNftCreatures } from '../client';

const { mockedClient } = vi.hoisted(() => {
    return { mockedClient: { authedGet: vi.fn(), authedPost: vi.fn(), authedDelete: vi.fn() } };
});

vi.mock('../../quest-engine/client', () => mockedClient);

describe('nft client', () => {
    afterEach(() => {
        vi.resetAllMocks();
    });

    it('registers a creature', async () => {
        mockedClient.authedPost.mockResolvedValueOnce({ wallet: 'abc', mintAddress: 'mint123', name: 'Fino', stage: 1, mintTxSignature: 'sig', mintPriceLamports: 1000, mintedAt: 1, updatedAt: 1 });
        const res = await registerNftCreature('abc', 'mint123', 'Fino', 1, 'sig', 1000);
        expect(res.name).toBe('Fino');
        expect(mockedClient.authedPost).toHaveBeenCalledWith('/nft/register', expect.objectContaining({ wallet: 'abc', mintAddress: 'mint123' }), 'abc');
    });

    it('fetches creatures', async () => {
        mockedClient.authedGet.mockResolvedValueOnce({ creatures: [] });
        const res = await fetchNftCreatures('abc');
        expect(res).toHaveLength(0);
        expect(mockedClient.authedGet).toHaveBeenCalledWith('/nft/creatures', { wallet: 'abc' }, 'abc');
    });
});
