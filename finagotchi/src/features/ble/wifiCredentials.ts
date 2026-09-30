import * as SecureStore from 'expo-secure-store';

const VAULT_KEY = 'finagotchi_wifi_credentials';

type VaultEntry = { password: string; savedAt: number };
type Vault = Record<string, VaultEntry>;

function isVaultEntry(value: unknown): value is VaultEntry {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as VaultEntry).password === 'string' &&
        typeof (value as VaultEntry).savedAt === 'number'
    );
}

/**
 * Read the whole vault. Corrupt payloads or unavailable SecureStore (e.g.
 * web) resolve to an empty vault — never throw.
 */
async function readVault(): Promise<Vault> {
    try {
        const raw = await SecureStore.getItemAsync(VAULT_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return {};
        }
        const vault: Vault = {};
        for (const [ssid, entry] of Object.entries(parsed)) {
            if (isVaultEntry(entry)) vault[ssid] = entry;
        }
        return vault;
    } catch {
        return {};
    }
}

async function writeVault(vault: Vault): Promise<void> {
    try {
        await SecureStore.setItemAsync(VAULT_KEY, JSON.stringify(vault));
    } catch {
        // Best effort — a missed save just means the next connect won't
        // auto-sync this network.
    }
}

/** Remember the password for a network so future connects can auto-sync it. */
export async function saveWifiCredentials(
    ssid: string,
    password: string,
): Promise<void> {
    const vault = await readVault();
    vault[ssid] = { password, savedAt: Date.now() };
    await writeVault(vault);
}

/** Password for a previously remembered network, or null if unknown. */
export async function getWifiCredentials(ssid: string): Promise<string | null> {
    const vault = await readVault();
    return vault[ssid]?.password ?? null;
}

export async function removeWifiCredentials(ssid: string): Promise<void> {
    const vault = await readVault();
    if (!(ssid in vault)) return;
    delete vault[ssid];
    await writeVault(vault);
}

export async function listSavedSsids(): Promise<string[]> {
    const vault = await readVault();
    return Object.keys(vault);
}
