import { authedGet, authedPost, authedDelete } from '../quest-engine/client';

export interface NftCreature {
    wallet: string;
    mintAddress: string;
    name: string;
    stage: number;
    mintTxSignature: string;
    mintPriceLamports: number;
    mintedAt: number;
    updatedAt: number;
}

export async function registerNftCreature(
    wallet: string,
    mintAddress: string,
    name: string,
    stage: number,
    mintTxSignature: string,
    mintPriceLamports: number
): Promise<NftCreature> {
    return (await authedPost('/nft/register', { wallet, mintAddress, name, stage, mintTxSignature, mintPriceLamports }, wallet)) as NftCreature;
}

export async function fetchNftCreatures(wallet: string): Promise<NftCreature[]> {
    const res = (await authedGet('/nft/creatures', { wallet }, wallet)) as { creatures: NftCreature[] };
    return res.creatures;
}

export async function fetchNftCreature(wallet: string, mintAddress: string): Promise<NftCreature | null> {
    return (await authedGet(`/nft/creatures/${mintAddress}`, { wallet }, wallet)) as NftCreature | null;
}

export async function updateNftCreature(
    wallet: string,
    mintAddress: string,
    updates: { name?: string; stage?: number }
): Promise<void> {
    await authedPost(`/nft/creatures/${mintAddress}`, { wallet, ...updates }, wallet);
}

export async function deleteNftCreature(wallet: string, mintAddress: string): Promise<void> {
    await authedDelete(`/nft/creatures/${mintAddress}`, { wallet }, wallet);
}
