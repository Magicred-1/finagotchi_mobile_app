import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * JupiterDcaClient JWT lifecycle tests: in-flight dedupe, SecureStore
 * persistence/migration, and the no-signature-prompt mode used by
 * background polling. fetch and both stores are mocked; the client module
 * is re-imported per test because its caches are module-level.
 */

const secureStoreData = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
    getItemAsync: async (key: string) => secureStoreData.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
        secureStoreData.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
        secureStoreData.delete(key);
    },
}));

const asyncStorageData = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: async (key: string) => asyncStorageData.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            asyncStorageData.set(key, value);
        },
        removeItem: async (key: string) => {
            asyncStorageData.delete(key);
        },
    },
}));

// The DCA client lazy-imports the quest-engine client for the server base
// URL and the session JWT; mock it so no real auth/server is involved.
vi.mock('../../../features/quest-engine/client', () => {
    class QuestClientError extends Error {
        code: string;
        constructor(code: string, message: string) {
            super(message);
            this.name = 'QuestClientError';
            this.code = code;
        }
    }
    return {
        QuestClientError,
        getQuestServerBaseUrl: () => 'http://quest.test',
        ensureAuthToken: async (_wallet: string) => 'session-jwt',
        clearAuthSession: async () => {},
    };
});

const WALLET = 'DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23M';
const SECURE_KEY = `finagotchi_dca_jwt_${WALLET}`;
const LEGACY_KEY = `finagotchi-dca-jwt:${WALLET}`;

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as unknown as Response;
}

function mockAuthFetch(fetchMock: ReturnType<typeof vi.fn>) {
    fetchMock.mockImplementation(async (input: unknown) => {
        const url = String(input);
        if (url.includes('/auth/challenge')) {
            return jsonResponse({ challenge: 'challenge-1' });
        }
        if (url.includes('/auth/verify')) {
            return jsonResponse({ token: 'fresh-jwt' });
        }
        return jsonResponse({}, 404);
    });
}

async function loadClient() {
    vi.resetModules();
    return import('../JupiterDcaClient');
}

describe('JupiterDcaClient auth', () => {
    beforeEach(() => {
        secureStoreData.clear();
        asyncStorageData.clear();
    });

    it('dedupes concurrent JWT acquisition into one signature prompt', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        mockAuthFetch(fetchMock);
        const { getAuthToken } = await loadClient();
        const signMessage = vi.fn(async () => 'sig');

        const [a, b] = await Promise.all([
            getAuthToken({ walletPubkey: WALLET, signMessage }),
            getAuthToken({ walletPubkey: WALLET, signMessage }),
        ]);

        expect(a).toBe('fresh-jwt');
        expect(b).toBe('fresh-jwt');
        expect(signMessage).toHaveBeenCalledTimes(1);
        expect(
            fetchMock.mock.calls.filter(([u]) => String(u).includes('/auth/challenge'))
        ).toHaveLength(1);
        vi.unstubAllGlobals();
    });

    it('throws DcaReauthRequiredError without signing when prompts are disabled', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { getAuthToken, DcaReauthRequiredError } = await loadClient();
        const signMessage = vi.fn(async () => 'sig');

        await expect(
            getAuthToken({
                walletPubkey: WALLET,
                signMessage,
                allowSignaturePrompt: false,
            })
        ).rejects.toBeInstanceOf(DcaReauthRequiredError);
        expect(signMessage).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('serves a valid cached JWT from SecureStore without network or signing', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        secureStoreData.set(
            SECURE_KEY,
            JSON.stringify({ token: 'cached-jwt', expiresAt: Date.now() + 60_000 })
        );
        const { getAuthToken } = await loadClient();
        const signMessage = vi.fn(async () => 'sig');

        await expect(
            getAuthToken({ walletPubkey: WALLET, signMessage })
        ).resolves.toBe('cached-jwt');
        expect(signMessage).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('migrates a legacy AsyncStorage JWT into SecureStore', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        asyncStorageData.set(
            LEGACY_KEY,
            JSON.stringify({ token: 'legacy-jwt', expiresAt: Date.now() + 60_000 })
        );
        const { getAuthToken } = await loadClient();
        const signMessage = vi.fn(async () => 'sig');

        await expect(
            getAuthToken({ walletPubkey: WALLET, signMessage })
        ).resolves.toBe('legacy-jwt');
        // Migration writes through to SecureStore and clears the legacy entry.
        await new Promise((r) => setTimeout(r, 0));
        expect(JSON.parse(secureStoreData.get(SECURE_KEY) ?? '{}').token).toBe(
            'legacy-jwt'
        );
        expect(asyncStorageData.has(LEGACY_KEY)).toBe(false);
        expect(signMessage).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('fetchPlanOrder with prompts disabled surfaces re-auth instead of signing', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { fetchPlanOrder, DcaReauthRequiredError } = await loadClient();
        const signMessage = vi.fn(async () => 'sig');

        await expect(
            fetchPlanOrder({
                walletPubkey: WALLET,
                orderId: 'order-1',
                signMessage,
                allowSignaturePrompt: false,
            })
        ).rejects.toBeInstanceOf(DcaReauthRequiredError);
        expect(signMessage).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('routes authed calls through the server proxy with both JWT headers', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        secureStoreData.set(
            SECURE_KEY,
            JSON.stringify({ token: 'cached-jwt', expiresAt: Date.now() + 60_000 })
        );
        fetchMock.mockImplementation(async () => jsonResponse({}, 404));
        const { fetchPlanOrder } = await loadClient();
        const signMessage = vi.fn(async () => 'sig');

        await fetchPlanOrder({ walletPubkey: WALLET, orderId: 'order-1', signMessage });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
        expect(String(url)).toBe(
            `http://quest.test/jup/orders/history/dca/order-1?wallet=${encodeURIComponent(WALLET)}`
        );
        const headers = init.headers as Record<string, string>;
        // Our server session JWT rides Authorization; the Jupiter JWT rides
        // the dedicated proxy header. No API key is ever sent.
        expect(headers.Authorization).toBe('Bearer session-jwt');
        expect(headers['X-Jupiter-Authorization']).toBe('Bearer cached-jwt');
        expect(headers['x-api-key']).toBeUndefined();
        vi.unstubAllGlobals();
    });

    it('sends the server session JWT (and no api key) on auth challenge calls', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        mockAuthFetch(fetchMock);
        const { getAuthToken } = await loadClient();
        const signMessage = vi.fn(async () => 'sig');

        await getAuthToken({ walletPubkey: WALLET, signMessage });

        const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
        expect(String(url)).toBe(
            `http://quest.test/jup/auth/challenge?wallet=${encodeURIComponent(WALLET)}`
        );
        const headers = init.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer session-jwt');
        expect(headers['x-api-key']).toBeUndefined();
        vi.unstubAllGlobals();
    });
});
