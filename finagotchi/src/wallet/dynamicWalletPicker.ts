import { dynamicClient } from './dynamicClient';

export type WalletOption = {
    key: string;
    name: string;
    iconUrl: string;
};

export async function getWalletOptions(): Promise<WalletOption[]> {
    const options = ((dynamicClient as any).wallets.walletOptions as WalletOption[]) ?? [];
    return options;
}

export async function connectDynamicWallet(key: string): Promise<void> {
    await (dynamicClient as any).wallets.connectWallet(key);
}
