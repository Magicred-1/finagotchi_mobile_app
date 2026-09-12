import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import bs58 from 'bs58';

import { utf8Bytes, type ActivityProfile } from '../../../../shared/quest-engine';

/** SecureStore key holding the optional bearer token (extra deployment gate). */
const API_KEY_SECURE_STORE_KEY = 'quest_api_key';
const REQUEST_TIMEOUT_MS = 10_000;
/** Dev default only — production builds must set an HTTPS questServerUrl extra. */
const DEFAULT_BASE_URL = 'http://localhost:3000';

export interface AuthChallenge {
    message: string;
    nonce: string;
    expiresAt: number;
}

export interface BackfillResponse {
    wallet: string;
    signaturesScanned: number;
    eventsIngested: number;
    profile: ActivityProfile;
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
    | 'bad_signature';

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
 * Bearer token resolution order: SecureStore (set at provisioning time),
 * then the `questApiKey` app-config extra, then EXPO_PUBLIC_QUEST_API_KEY.
 * This is now only an OPTIONAL extra gate — the real auth is the
 * wallet-signed challenge below. The token is never logged.
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

const WALLET_AUTH_REASONS: readonly string[] = [
    'malformed',
    'unknown_nonce',
    'expired',
    'wallet_mismatch',
    'bad_signature',
];

async function post<TResponse>(
    path: string,
    body: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
): Promise<TResponse> {
    const token = await getApiKey();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...extraHeaders,
    };
    if (token) headers.Authorization = `Bearer ${token}`;

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
        // A 401 carrying a wallet-auth reason came from the x-wallet-auth
        // gate; a bare 401 is the optional MOBILE_API_KEY bearer gate.
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

/** Public (modulo the optional bearer gate): fetch a fresh single-use challenge. */
export function getChallenge(wallet: string): Promise<AuthChallenge> {
    return post<AuthChallenge>('/auth/challenge', { wallet });
}

async function signChallenge(challenge: AuthChallenge, wallet: string): Promise<string> {
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
    return `${wallet}:${challenge.nonce}:${bs58.encode(signature)}`;
}

/** Nonces are single-use with a 5 min TTL — one fresh challenge per call. */
async function authedPost<TResponse>(
    path: string,
    body: Record<string, unknown>,
    wallet: string,
): Promise<TResponse> {
    const attempt = async (): Promise<TResponse> => {
        const challenge = await getChallenge(wallet);
        const header = await signChallenge(challenge, wallet);
        return post<TResponse>(path, body, { 'x-wallet-auth': header });
    };
    try {
        return await attempt();
    } catch (err) {
        // 'expired'/'unknown_nonce' mean the nonce died in flight (the server
        // consumes it on first presentation) — retry ONCE with a fresh
        // challenge. bad_signature/wallet_mismatch are signer/config bugs and
        // propagate.
        if (
            err instanceof QuestClientError &&
            err.code === 'auth' &&
            (err.authReason === 'expired' || err.authReason === 'unknown_nonce')
        ) {
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
