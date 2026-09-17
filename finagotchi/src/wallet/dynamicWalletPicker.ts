import { dynamicClient } from './dynamicClient';

export type WalletOption = {
    key: string;
    name: string;
    iconUrl: string;
    connectionOptions: { type: string }[];
    installationUrls?: { [platform: string]: string };
};

export async function getWalletOptions(): Promise<WalletOption[]> {
    const options = (await (dynamicClient as any).wallets.getWalletOptions()) as WalletOption[];
    return options;
}

export async function connectDynamicWallet(key: string): Promise<void> {
    await (dynamicClient as any).wallets.connectWallet(key);
}
