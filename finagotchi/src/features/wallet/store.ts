import AsyncStorage from '@react-native-async-storage/async-storage';
import { PublicKey } from '@solana/web3.js';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type WalletSession = {
    authToken: string | null;
    phantomEncryptionPublicKey: string | null;
    phantomSessionId: string | null;
};

type WalletState = {
    address: string | null;
    session: WalletSession;

    connect: (address: string) => boolean;
    setSession: (session: Partial<WalletSession>) => void;
    disconnect: () => void;
};

const defaultSession: WalletSession = {
    authToken: null,
    phantomEncryptionPublicKey: null,
    phantomSessionId: null,
};

export const useWalletStore = create<WalletState>()(
    persist(
        (set) => ({
            address: null,
            session: defaultSession,

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

            setSession: (session) => {
                set((state) => ({
                    session: {
                        ...state.session,
                        ...session,
                    },
                }));
            },

            disconnect: () => {
                set({
                    address: null,
                    session: defaultSession,
                });
            },
        }),
        {
            name: 'finagotchi-wallet',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
