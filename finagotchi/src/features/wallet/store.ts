import AsyncStorage from '@react-native-async-storage/async-storage';
import { PublicKey } from '@solana/web3.js';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type WalletState = {
    address: string | null;

    connect: (address: string) => boolean;
    disconnect: () => void;
};

export const useWalletStore = create<WalletState>()(
    persist(
        (set) => ({
        address: null,

        connect: (address) => {
            try {
            new PublicKey(address);

            set({
                address,
            });

            return true;
            } catch {
            return false;
            }
        },

        disconnect: () => {
            set({
            address: null,
            });
        },
        }),
        {
        name: 'finagotchi-wallet',
        storage: createJSONStorage(() => AsyncStorage),
        }
    )
);