import { beforeEach, describe, expect, it } from 'vitest';

import { usePetStore } from '../store';
import { useWalletStore } from '../../wallet/store';

describe('resetCreature (wallet switch)', () => {
    beforeEach(() => {
        usePetStore.getState().resetCreature();
        useWalletStore.setState({ address: null });
    });

    it('clears creature identity and progress to fresh-install values', () => {
        usePetStore.setState({
            name: 'Finny',
            mintAddress: 'mint-abc',
            ownerAddress: 'wallet-a',
            stage: 7,
            balance: 4200,
            happiness: 12,
            xp: 900,
            level: 9,
            isDead: true,
            deathCount: 3,
        });

        usePetStore.getState().resetCreature();
        const pet = usePetStore.getState();

        expect(pet.name).toBeNull();
        expect(pet.mintAddress).toBeNull();
        expect(pet.ownerAddress).toBeNull();
        expect(pet.stage).toBe(1);
        expect(pet.balance).toBe(750);
        expect(pet.happiness).toBe(100);
        expect(pet.xp).toBe(0);
        expect(pet.level).toBe(1);
        expect(pet.isDead).toBe(false);
        expect(pet.deathCount).toBe(0);
        expect(pet.lifeTimerEndsAt).toBeNull();
    });

    it('records the connected wallet as owner when minting', () => {
        useWalletStore.setState({ address: 'wallet-b' });
        usePetStore.getState().mintCreature('Blob', 'mint-xyz', 'sig-1');

        const pet = usePetStore.getState();
        expect(pet.ownerAddress).toBe('wallet-b');
        expect(pet.mintAddress).toBe('mint-xyz');
    });

    it('detects a wallet switch via ownerAddress mismatch', () => {
        useWalletStore.setState({ address: 'wallet-a' });
        usePetStore.getState().mintCreature('Blob', 'mint-xyz');

        useWalletStore.setState({ address: 'wallet-b' });
        const pet = usePetStore.getState();
        const switched = pet.ownerAddress !== null && pet.ownerAddress !== 'wallet-b';
        expect(switched).toBe(true);
    });
});
