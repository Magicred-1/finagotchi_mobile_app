import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import bs58 from 'bs58';

import { utf8Bytes, type ActivityProfile } from '../../../../shared/quest-engine';
import { useOnboardingStore } from '../onboarding/store';

/** SecureStore key holding the optional static API key (extra deployment gate). */
const API_KEY_SECURE_STORE_KEY = 'quest_api_key';
/** SecureStore key holding the per-user API key issued by /auth/login. */
const USER_API_KEY_SECURE_STORE_KEY = 'quest_user_api_key';
/** SecureStore key holding the wallet session issued by /auth/login. */
const AUTH_SESSION_SECURE_STORE_KEY = 'finagotchi_auth_session';
const REQUEST_TIMEOUT_MS = 10_000;
/** Re-login when the stored token has less than this much life left. */
const TOKEN_EXPIRY_SKEW_MS = 60_000;
/** Dev default only — production builds must set an HTTPS questServerUrl extra. */
const DEFAULT_BASE_URL = 'http://localhost:3000';

export interface AuthChallenge {
    message: string;
    nonce: string;
    expiresAt: number;
}

/** Wallet session issued by POST /auth/login and cached in SecureStore. */
export interface AuthSession {
    wallet: string;
    token: string;
    /** Epoch ms. */
    expiresAt: number;
    /**
     * Per-user API key issued at sign-in; presented on future
     * /auth/challenge and /auth/login calls. Rotated on every login.
     */
    apiKey?: string;
}

export interface BackfillResponse {
    wallet: string;
    signaturesScanned: number;
    eventsIngested: number;
    profile: ActivityProfile;
    /**
     * Today's quests with exact server-side progress (tx_events-counted).
     * Optional: older server builds don't send it — fall back to local
     * profile seeding.
     */
    quests?: ServerQuestProgress[];
}

/** Server-computed quest progress payload (Quest + progress fields). */
export interface ServerQuestProgress {
    id: string;
    current: number;
    complete: boolean;
    /** Distinct UTC day strings with events in the window. */
    days: string[];
}

export interface VerifyClaimRequest {
    wallet: string;
    /** UTC `YYYY-MM-DD`. */
    day: string;
    questId: string;
    /** Optional tx signature offered as evidence. */
    signature?: string;
}

export type VerifyClaimResponse =
    | { credited: true; xp: number; questId: string; duplicate: boolean; flagged: boolean }
    | { credited: false; reason: string };

/** Reasons the server returns on 401 wallet-auth failures. */
export type WalletAuthFailureReason =
    | 'malformed'
    | 'unknown_nonce'
    | 'expired'
    | 'wallet_mismatch'
    | 'bad_signature'
    | 'token_malformed'
    | 'token_bad_signature'
    | 'token_expired';

export type QuestClientErrorCode = 'network' | 'timeout' | 'http' | 'auth' | 'signer';

export class QuestClientError extends Error {
    readonly code: QuestClientErrorCode;
    readonly status?: number;
    /** Set when code === 'auth': the server's wallet-auth failure reason. */
    readonly authReason?: WalletAuthFailureReason;

    constructor(
        code: QuestClientErrorCode,
        message: string,
        status?: number,
        authReason?: WalletAuthFailureReason,
    ) {
        super(message);
        this.name = 'QuestClientError';
        this.code = code;
        this.status = status;
        this.authReason = authReason;
    }
}

/**
 * Signs the UTF-8 bytes of an auth challenge message with the wallet's
 * ed25519 key. Injected by the wallet layer (MWA or Dynamic embedded) —
 * the quest module never touches key material itself.
 */
export type AuthSigner = (message: Uint8Array, wallet: string) => Promise<Uint8Array>;

let authSigner: AuthSigner | null = null;

export function setAuthSigner(signer: AuthSigner | null): void {
    authSigner = signer;
}

function extraValue(key: string): string | undefined {
    const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
    const value = extra?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function getQuestServerBaseUrl(): string {
    return extraValue('questServerUrl') ?? DEFAULT_BASE_URL;
}

/**
 * Static bearer token resolution order: SecureStore (set at provisioning
 * time), then the `questApiKey` app-config extra, then
 * EXPO_PUBLIC_QUEST_API_KEY. This is only an OPTIONAL extra gate on the
 * token-issuing endpoints (/auth/challenge, /auth/login) — data calls ride
 * the per-wallet session JWT. The token is never logged.
 */
async function getApiKey(): Promise<string | undefined> {
    try {
        const stored = await SecureStore.getItemAsync(API_KEY_SECURE_STORE_KEY);
        if (stored) return stored;
    } catch {
        // SecureStore unavailable (e.g. web) — fall through to config/env.
    }
    const env = (process.env as Record<string, string | undefined>)
        .EXPO_PUBLIC_QUEST_API_KEY;
    return extraValue('questApiKey') ?? env;
}

export async function setApiKey(token: string | null): Promise<void> {
    if (token === null) {
        await SecureStore.deleteItemAsync(API_KEY_SECURE_STORE_KEY);
    } else {
        await SecureStore.setItemAsync(API_KEY_SECURE_STORE_KEY, token);
    }
}

/**
 * Per-user API key issued by /auth/login, stored WITH its wallet: presenting
 * wallet A's key for wallet B's challenge is a server-side wallet_mismatch,
 * so the key is only ever read for the wallet it was issued to.
 */
async function getUserApiKey(wallet: string): Promise<string | undefined> {
    try {
        const raw = await SecureStore.getItemAsync(USER_API_KEY_SECURE_STORE_KEY);
        if (!raw) return undefined;
        const parsed = JSON.parse(raw) as { wallet?: unknown; key?: unknown };
        if (parsed.wallet === wallet && typeof parsed.key === 'string') {
            return parsed.key;
        }
    } catch {
        // SecureStore unavailable (e.g. web) — no per-user key.
    }
    return undefined;
}

async function setUserApiKey(wallet: string, key: string): Promise<void> {
    try {
        await SecureStore.setItemAsync(
            USER_API_KEY_SECURE_STORE_KEY,
            JSON.stringify({ wallet, key }),
        );
    } catch {
        // Best effort — next login rotates a fresh key anyway.
    }
}

async function clearUserApiKey(): Promise<void> {
    try {
        await SecureStore.deleteItemAsync(USER_API_KEY_SECURE_STORE_KEY);
    } catch {
        // Best effort.
    }
}

const WALLET_AUTH_REASONS: readonly string[] = [
    'malformed',
    'unknown_nonce',
    'expired',
    'wallet_mismatch',
    'bad_signature',
    'token_malformed',
    'token_bad_signature',
    'token_expired',
];

async function post<TResponse>(
    path: string,
    body: Record<string, unknown>,
    options?: { bearer?: string; apiKeyForWallet?: string },
): Promise<TResponse> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (options?.bearer) {
        headers.Authorization = `Bearer ${options.bearer}`;
    } else if (options?.apiKeyForWallet) {
        // Token-issuing endpoints: prefer the wallet's own issued key, fall
        // back to the provisioned/config static key (first-ever login).
        const token =
            (await getUserApiKey(options.apiKeyForWallet)) ?? (await getApiKey());
        if (token) headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(`${getQuestServerBaseUrl()}${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new QuestClientError('timeout', `quest server ${path} timed out`);
        }
        throw new QuestClientError(
            'network',
            `quest server unreachable: ${err instanceof Error ? err.message : String(err)}`,
        );
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) {
        // Surface the server's error string but never request headers.
        let detail = '';
        let authReason: WalletAuthFailureReason | undefined;
        try {
            const parsed = (await res.json()) as { error?: unknown; reason?: unknown };
            if (typeof parsed.error === 'string') detail = `: ${parsed.error}`;
            if (typeof parsed.reason === 'string' && WALLET_AUTH_REASONS.includes(parsed.reason)) {
                authReason = parsed.reason as WalletAuthFailureReason;
            }
        } catch {
            // Non-JSON error body — status alone is enough.
        }
        if (res.status === 401 && authReason !== undefined) {
            throw new QuestClientError(
                'auth',
                `${path} wallet auth rejected (${authReason})`,
                res.status,
                authReason,
            );
        }
        throw new QuestClientError('http', `${path} failed (${res.status})${detail}`, res.status);
    }

    return (await res.json()) as TResponse;
}

/** Public (modulo the optional static gate): fetch a fresh single-use challenge. */
export function getChallenge(wallet: string): Promise<AuthChallenge> {
    return post<AuthChallenge>('/auth/challenge', { wallet }, { apiKeyForWallet: wallet });
}

async function signChallengeMessage(challenge: AuthChallenge, wallet: string): Promise<string> {
    if (!authSigner) {
        throw new QuestClientError(
            'signer',
            'No auth signer configured — call setAuthSigner() after wallet connect',
        );
    }
    let signature: Uint8Array;
    try {
        // The server message is already buildAuthMessage(wallet, nonce,
        // expiresAt) — sign its UTF-8 bytes verbatim, never re-concatenate.
        signature = await authSigner(utf8Bytes(challenge.message), wallet);
    } catch (err) {
        // User declined or the wallet session dropped — retryable next time.
        throw new QuestClientError(
            'signer',
            `wallet signing failed: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    return bs58.encode(signature);
}

async function readStoredSession(): Promise<AuthSession | null> {
    try {
        const raw = await SecureStore.getItemAsync(AUTH_SESSION_SECURE_STORE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<AuthSession>;
        if (
            typeof parsed.wallet !== 'string' ||
            typeof parsed.token !== 'string' ||
            typeof parsed.expiresAt !== 'number'
        ) {
            return null;
        }
        return { wallet: parsed.wallet, token: parsed.token, expiresAt: parsed.expiresAt };
    } catch {
        return null;
    }
}

async function storeSession(session: AuthSession): Promise<void> {
    try {
        await SecureStore.setItemAsync(
            AUTH_SESSION_SECURE_STORE_KEY,
            JSON.stringify(session),
        );
    } catch {
        // SecureStore unavailable (e.g. web) — session stays in-memory only
        // for this run via the in-flight/cached paths; next login re-signs.
    }
}

/** Drop the cached session (disconnect, revoked consent, dead token). */
export async function clearAuthSession(): Promise<void> {
    try {
        await SecureStore.deleteItemAsync(AUTH_SESSION_SECURE_STORE_KEY);
    } catch {
        // Best effort — a stale entry just fails auth and gets overwritten.
    }
}

/** Serialize concurrent logins so a burst of sync calls signs ONE challenge. */
let loginInFlight: Promise<string> | null = null;

/** One challenge → sign → token exchange round. */
async function loginOnce(wallet: string): Promise<string> {
    const challenge = await getChallenge(wallet);
    const signature = await signChallengeMessage(challenge, wallet);
    const session = await post<AuthSession>(
        '/auth/login',
        { wallet, nonce: challenge.nonce, signature },
        { apiKeyForWallet: wallet },
    );
    await storeSession(session);
    // The login response carries the per-user API key for future
    // challenge/login calls — stored bound to this wallet.
    if (session.apiKey) {
        await setUserApiKey(wallet, session.apiKey);
    }
    return session.token;
}

/**
 * Sign-in with wallet: fetch a challenge, sign it with the connected wallet,
 * exchange it for a session JWT, and cache it. Requires the user's consent
 * (granted on the onboarding auth step) — without it this throws a 'signer'
 * error so sync callers treat it as "maybe later", never as definitive.
 */
export function login(wallet: string): Promise<string> {
    if (!useOnboardingStore.getState().serverAuthConsentAt) {
        return Promise.reject(
            new QuestClientError(
                'signer',
                'Server sync not enabled — the user has not consented to wallet sign-in',
            ),
        );
    }
    loginInFlight ??= (async () => {
        try {
            return await loginOnce(wallet);
        } catch (err) {
            // A stored per-user key that was rotated away (e.g. another
            // device logged in) 401s the challenge — drop it and retry once
            // on the provisioned static key / open gate.
            if (err instanceof QuestClientError && err.status === 401) {
                await clearUserApiKey();
                return loginOnce(wallet);
            }
            throw err;
        }
    })().finally(() => {
        loginInFlight = null;
    });
    return loginInFlight;
}

/**
 * Return a valid session token for the wallet: the cached JWT when it still
 * has life left, otherwise a fresh wallet-signed login.
 */
export async function ensureAuthToken(wallet: string): Promise<string> {
    const stored = await readStoredSession();
    if (
        stored &&
        stored.wallet === wallet &&
        stored.expiresAt - TOKEN_EXPIRY_SKEW_MS > Date.now()
    ) {
        return stored.token;
    }
    return login(wallet);
}

/**
 * Authed data call: rides the wallet session JWT. On any 401 the cached
 * token is dropped and ONE retry runs with a fresh login — covers server
 * secret rotation and clock skew without signing storms.
 */
async function authedPost<TResponse>(
    path: string,
    body: Record<string, unknown>,
    wallet: string,
): Promise<TResponse> {
    const attempt = async (): Promise<TResponse> => {
        const token = await ensureAuthToken(wallet);
        return post<TResponse>(path, body, { bearer: token });
    };
    try {
        return await attempt();
    } catch (err) {
        if (err instanceof QuestClientError && err.status === 401) {
            await clearAuthSession();
            return attempt();
        }
        throw err;
    }
}

export function backfill(wallet: string): Promise<BackfillResponse> {
    return authedPost<BackfillResponse>('/backfill', { wallet }, wallet);
}

export function verifyClaim(claim: VerifyClaimRequest): Promise<VerifyClaimResponse> {
    return authedPost<VerifyClaimResponse>('/verify', { ...claim }, claim.wallet);
}
