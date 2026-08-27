import AsyncStorage from '@react-native-async-storage/async-storage';
import { PublicKey } from '@solana/web3.js';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

function todayKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        '0'
    )}-${String(date.getDate()).padStart(2, '0')}`;
}

export type WalletConnectionType = 'turnkey' | 'mwa' | null;

export type WalletSession = {
    authToken: string | null;
    connectionType: WalletConnectionType;
    turnkeyUserId: string | null;
    turnkeyWalletId: string | null;
};

type WalletState = {
    address: string | null;
    session: WalletSession;
    transactionsToday: number;
    transactionsResetAt: string | null;

    connect: (address: string, connectionType: WalletConnectionType) => boolean;
    setSession: (session: Partial<WalletSession>) => void;
    recordTransaction: () => void;
    resetTransactionsIfNeeded: () => void;
    disconnect: () => void;
};

const defaultSession: WalletSession = {
    authToken: null,
    connectionType: null,
    turnkeyUserId: null,
    turnkeyWalletId: null,
};

export const useWalletStore = create<WalletState>()(
    persist(
        (set, get) => ({
            address: null,
            session: defaultSession,
            transactionsToday: 0,
            transactionsResetAt: null,

            connect: (address, connectionType) => {
                try {
                    new PublicKey(address);

                    set({
                        address,
                        session: {
                            ...defaultSession,
                            connectionType,
                        },
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

            recordTransaction: () => {
                get().resetTransactionsIfNeeded();
                set((state) => ({
                    transactionsToday: state.transactionsToday + 1,
                }));
            },

            resetTransactionsIfNeeded: () => {
                const today = todayKey();
                if (get().transactionsResetAt !== today) {
                    set({ transactionsToday: 0, transactionsResetAt: today });
                }
            },

            disconnect: () => {
                set({
                    address: null,
                    session: defaultSession,
                    transactionsToday: 0,
                    transactionsResetAt: null,
                });
            },
        }),
        {
            name: 'finagotchi-wallet',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
