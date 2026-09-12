/**
 * Non-custodial Jupiter DCA client — Trigger API v2 (REST).
 *
 * This module NEVER holds keys. Auth is a wallet-signed challenge (24h JWT);
 * deposits and withdrawals are signed by the injected wallet callbacks. The
 * budget lives in the user's Jupiter vault and only the user can withdraw it:
 * cancelling an order returns the unfilled remainder to the user's wallet.
 *
 * Docs: https://developers.jup.ag/docs/trigger/dca
 */

import { SUPPORTED_TOKENS, USDC_DECIMALS, USDC_MINT, tokenByMint } from './types';

const BASE_URL = 'https://api.jup.ag/trigger/v2';

const JWT_TTL_MS = 24 * 60 * 60 * 1000;
/** Refresh the 24h JWT an hour early so it never expires mid-request. */
const JWT_TTL_MARGIN_MS = 60 * 60 * 1000;
const JWT_STORAGE_PREFIX = 'finagotchi-dca-jwt:';

/** Jupiter's per-round minimum, in USD (input is USDC, so USD == USDC). */
export const MIN_ROUND_USD = 10;
export const MIN_ORDER_COUNT = 2;
export const MIN_INTERVAL_SEC = 60;
export const MAX_INTERVAL_SEC = 31_536_000;

/**
 * Signs an arbitrary UTF-8 message, returning a bs58 ed25519 signature.
 * Injected by the wallet layer — the client never touches keys.
 */
export type SignMessageFn = (message: string) => Promise<string>;

/**
 * Signs (without sending) a base64 VersionedTransaction, returning the signed
 * transaction as base64. Injected by the wallet layer.
 */
export type SignTransactionFn = (base64Tx: string) => Promise<string>;

export interface CreatePlanOrderInput {
    /** Output token mint (must be in SUPPORTED_TOKENS). */
    outputMint: string;
    /** USDC per round (>= MIN_ROUND_USD). */
    amountPerTick: number;
    /** Seconds between rounds (60 .. 31,536,000). */
    intervalSec: number;
    /** Total USDC budget deposited into the vault. */
    totalBudget: number;
}

export interface CreatedPlanOrder {
    /** Trigger API order id (UUID) — store as the plan's dcaAccountPubkey. */
    orderId: string;
    /** On-chain deposit signature (the deposit lands during create). */
    txSignature: string;
}

/** Normalized view of a Trigger DCA order (from GET /orders/history/dca/{id}). */
export interface PlanOrderSnapshot {
    /** Raw API state: depositing|active|executing|withdrawing|completed|cancelled|deposit_failed. */
    state: string;
    roundsFilled: number;
    numberOfRounds: number;
    /** USDC spent across filled rounds. */
    inputAmountUsed: number;
    /** USDC initially deposited. */
    inputAmountInitial: number;
    /** Output received across filled rounds, in output-token base units. */
    outputAmountTotal: number;
    /** USDC swapped per round. */
    amountPerRound: number;
    /** Unix seconds of the next scheduled round; null when none. */
    nextFillAt: number | null;
    /** Unix seconds of the most recent fill; null when none. */
    lastFillAt: number | null;
}

// Test seam: lets vitest/node smoke tests inject a fake fetch.
type FetchImpl = typeof fetch;
let fetchImpl: FetchImpl | null = null;

/** Override the fetch implementation (pass null to restore the global). */
export function setDcaFetchImpl(impl: FetchImpl | null): void {
    fetchImpl = impl;
}

function getFetch(): FetchImpl {
    return fetchImpl ?? globalThis.fetch;
}

function apiKey(): string {
    const key = process.env.EXPO_PUBLIC_JUPITER_API_KEY;
    if (!key) {
        throw new Error(
            'dca: Jupiter API key missing — set EXPO_PUBLIC_JUPITER_API_KEY in your .env ' +
                '(the Jupiter Trigger API requires an x-api-key header on every request)'
        );
    }
    return key;
}

interface CachedJwt {
    token: string;
    /** ms epoch at which the token should be considered expired. */
    expiresAt: number;
}

const jwtCache = new Map<string, CachedJwt>();

async function readStoredJwt(walletPubkey: string): Promise<CachedJwt | null> {
    try {
        const { default: AsyncStorage } = await import(
            '@react-native-async-storage/async-storage'
        );
        const raw = await AsyncStorage.getItem(JWT_STORAGE_PREFIX + walletPubkey);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedJwt;
        if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'number') {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

async function storeJwt(walletPubkey: string, jwt: CachedJwt): Promise<void> {
    try {
        const { default: AsyncStorage } = await import(
            '@react-native-async-storage/async-storage'
        );
        await AsyncStorage.setItem(JWT_STORAGE_PREFIX + walletPubkey, JSON.stringify(jwt));
    } catch {
        // Persistence is best-effort; the in-memory cache still applies.
    }
}

async function readBody(res: Response): Promise<unknown> {
    try {
        return await res.json();
    } catch {
        return null;
    }
}

function errorMessage(status: number, body: unknown): string {
    if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        const message = record.error ?? record.message;
        if (typeof message === 'string') return message;
    }
    return `HTTP ${status}`;
}

async function rawPost(path: string, body: unknown): Promise<unknown> {
    const res = await getFetch()(BASE_URL + path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey(),
        },
        body: JSON.stringify(body),
    });
    const data = await readBody(res);
    if (!res.ok) {
        throw new Error(`dca: ${path} failed: ${errorMessage(res.status, data)}`);
    }
    return data;
}

/**
 * Get a 24h JWT for the wallet, cached in memory and AsyncStorage
 * (`finagotchi-dca-jwt:<wallet>`). The wallet signs a server challenge via
 * the injected signMessage — no keys here. forceRefresh skips the cache
 * (used for the single 401 retry).
 */
export async function getAuthToken({
    walletPubkey,
    signMessage,
    forceRefresh = false,
}: {
    walletPubkey: string;
    signMessage: SignMessageFn;
    forceRefresh?: boolean;
}): Promise<string> {
    if (!forceRefresh) {
        const cached = jwtCache.get(walletPubkey) ?? (await readStoredJwt(walletPubkey));
        if (cached && cached.expiresAt > Date.now()) {
            jwtCache.set(walletPubkey, cached);
            return cached.token;
        }
    }

    const challenge = (await rawPost('/auth/challenge', {
        walletPubkey,
        type: 'message',
    })) as { challenge?: string };
    if (!challenge.challenge) {
        throw new Error('dca: auth challenge returned no challenge');
    }

    const signature = await signMessage(challenge.challenge);

    const verified = (await rawPost('/auth/verify', {
        type: 'message',
        walletPubkey,
        signature,
    })) as { token?: string };
    if (!verified.token) {
        throw new Error('dca: auth verify returned no token');
    }

    const jwt: CachedJwt = {
        token: verified.token,
        expiresAt: Date.now() + JWT_TTL_MS - JWT_TTL_MARGIN_MS,
    };
    jwtCache.set(walletPubkey, jwt);
    await storeJwt(walletPubkey, jwt);
    return jwt.token;
}

interface AuthedResponse {
    status: number;
    data: unknown;
}

/** Authenticated request; on 401 the JWT is refreshed once and retried. */
async function authedRequest({
    method,
    path,
    body,
    walletPubkey,
    signMessage,
}: {
    method: 'GET' | 'POST';
    path: string;
    body?: unknown;
    walletPubkey: string;
    signMessage: SignMessageFn;
}): Promise<AuthedResponse> {
    let token = await getAuthToken({ walletPubkey, signMessage });
    for (let attempt = 0; attempt < 2; attempt++) {
        const res = await getFetch()(BASE_URL + path, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey(),
                Authorization: `Bearer ${token}`,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (res.status === 401 && attempt === 0) {
            token = await getAuthToken({ walletPubkey, signMessage, forceRefresh: true });
            continue;
        }
        return { status: res.status, data: await readBody(res) };
    }
    throw new Error('dca: unreachable');
}

/** Integer-exact USDC base units (6 decimals) as a string. */
function usdcBaseUnits(amountUsdc: number): string {
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
        throw new Error(`dca: amount must be a positive finite number, got ${amountUsdc}`);
    }
    return String(Math.round(amountUsdc * 10 ** USDC_DECIMALS));
}

function baseUnitsToUsdc(value: unknown): number {
    return Number(value ?? 0) / 10 ** USDC_DECIMALS;
}

function isoToUnixSeconds(value: unknown): number | null {
    if (typeof value !== 'string' || value === '') return null;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : Math.round(ms / 1000);
}

/**
 * Jupiter Trigger is mainnet-only, so the deposit needs real mainnet USDC
 * plus a little mainnet SOL for the fee.
 */
const MAINNET_RPC =
    process.env.EXPO_PUBLIC_JUPITER_RPC ?? 'https://api.mainnet-beta.solana.com';
/** Rough fee headroom for the deposit transaction, in lamports. */
const MIN_FEE_LAMPORTS = 2_000_000;

async function rpcCall<T>(method: string, params: unknown[]): Promise<T | null> {
    try {
        const res = await getFetch()(MAINNET_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        });
        const data = (await readBody(res)) as { result?: T } | null;
        return data?.result ?? null;
    } catch {
        return null;
    }
}

/**
 * Fails fast with an actionable message when the wallet cannot fund the
 * deposit. Without this, an unfundable deposit is only discovered after
 * Jupiter spends ~30s trying to land it and the blockhash expires.
 * Preflight failures (RPC down) skip the check rather than block the flow.
 */
async function preflightFunding(
    walletPubkey: string,
    totalBudget: number
): Promise<void> {
    const [tokenAccounts, balance] = await Promise.all([
        rpcCall<{ value?: unknown[] }>('getTokenAccountsByOwner', [
            walletPubkey,
            { mint: USDC_MINT },
            { encoding: 'jsonParsed' },
        ]),
        rpcCall<{ value?: number }>('getBalance', [walletPubkey]),
    ]);
    if (tokenAccounts === null && balance === null) return;

    const usdcHeld = (tokenAccounts?.value ?? []).reduce<number>(
        (sum, account) => {
            const info = (
                account as {
                    account?: {
                        data?: { parsed?: { info?: { tokenAmount?: { uiAmount?: number } } } };
                    }
                }
            )?.account?.data?.parsed?.info?.tokenAmount;
            return sum + Number(info?.uiAmount ?? 0);
        },
        0
    );
    if (usdcHeld < totalBudget) {
        throw new Error(
            `This plan needs ${totalBudget} USDC on Solana mainnet, but your wallet holds ` +
                `${usdcHeld.toFixed(2)} USDC. Jupiter DCA runs on mainnet — devnet funds won't work.`
        );
    }

    const lamports = balance?.value ?? null;
    if (lamports !== null && lamports < MIN_FEE_LAMPORTS) {
        throw new Error(
            'Your wallet needs a little mainnet SOL (~0.002) to cover the deposit network fee.'
        );
    }
}

/**
 * Simulates the signed deposit against mainnet before handing it to Jupiter.
 * Jupiter reports any landing failure as "Transaction expired without
 * landing" after ~30s of retries, which hides the real cause; simulation
 * fails in ~1s and names it — usually missing funds.
 *
 * sigVerify stays OFF: the crafted deposit has co-signer slots that only
 * Jupiter fills server-side, so strict verification would reject every
 * correct submission with a "SignatureFailure" false positive.
 */
async function simulateSignedDeposit(base64Tx: string): Promise<void> {
    const result = await rpcCall<{
        value?: { err?: unknown; logs?: string[] | null };
    }>('simulateTransaction', [
        base64Tx,
        { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: false },
    ]);
    if (!result || result.value === undefined) return;
    const err = result.value.err;
    if (err === null || err === undefined) return;
    const logTail = (result.value.logs ?? []).slice(-3).join(' | ');
    throw new Error(
        `dca: deposit would fail on-chain: ${JSON.stringify(err)}${logTail ? ` (${logTail})` : ''}`
    );
}

/**
 * Create a DCA order: vault (register on first use) → craft deposit → user
 * signs the deposit (it is NOT sent by us) → submit the order. The deposit
 * lands on-chain during the create call; a 200 means the order is live.
 */
export async function createPlanOrder({
    walletPubkey,
    signMessage,
    signTransaction,
    input,
}: {
    walletPubkey: string;
    signMessage: SignMessageFn;
    signTransaction: SignTransactionFn;
    input: CreatePlanOrderInput;
}): Promise<CreatedPlanOrder> {
    if (!tokenByMint(input.outputMint)) {
        throw new Error(
            `dca: outputMint ${input.outputMint} is not in SUPPORTED_TOKENS ` +
                `(${SUPPORTED_TOKENS.map((t) => t.ticker).join(', ')})`
        );
    }
    if (!Number.isFinite(input.amountPerTick) || input.amountPerTick <= 0) {
        throw new Error(`dca: amountPerTick must be positive, got ${input.amountPerTick}`);
    }
    if (input.amountPerTick < MIN_ROUND_USD) {
        throw new Error(
            `dca: amountPerTick must be at least ${MIN_ROUND_USD} USD per round ` +
                `(Jupiter's per-order minimum), got ${input.amountPerTick} USD`
        );
    }
    if (!Number.isFinite(input.totalBudget) || input.totalBudget <= 0) {
        throw new Error(`dca: totalBudget must be positive, got ${input.totalBudget}`);
    }
    const orderCount = Math.floor(input.totalBudget / input.amountPerTick);
    if (orderCount < MIN_ORDER_COUNT) {
        throw new Error(
            `dca: totalBudget ${input.totalBudget} USD covers fewer than ${MIN_ORDER_COUNT} ` +
                `rounds of ${input.amountPerTick} USD — increase the budget or lower the per-round amount`
        );
    }
    if (input.intervalSec < MIN_INTERVAL_SEC || input.intervalSec > MAX_INTERVAL_SEC) {
        throw new Error(
            `dca: intervalSec must be between ${MIN_INTERVAL_SEC} and ${MAX_INTERVAL_SEC}, ` +
                `got ${input.intervalSec}`
        );
    }

    const inputAmount = usdcBaseUnits(input.totalBudget);
    const auth = { walletPubkey, signMessage };

    await preflightFunding(walletPubkey, input.totalBudget);

    const vault = await authedRequest({ method: 'GET', path: '/vault', ...auth });
    if (vault.status === 404) {
        const registered = await authedRequest({
            method: 'GET',
            path: '/vault/register',
            ...auth,
        });
        if (registered.status !== 200) {
            throw new Error(
                `dca: vault registration failed: ${errorMessage(registered.status, registered.data)}`
            );
        }
    } else if (vault.status !== 200) {
        throw new Error(`dca: vault lookup failed: ${errorMessage(vault.status, vault.data)}`);
    }

    /**
     * One craft → sign → submit cycle. The crafted deposit's blockhash has a
     * short life and a slow human (biometric prompt, reading the wallet
     * sheet) sits between craft and submission, so an expiry is retried once
     * with a fresh craft instead of failing the whole order.
     */
    const attemptCreate = async (): Promise<CreatedPlanOrder> => {
        const craft = await authedRequest({
            method: 'POST',
            path: '/deposit/craft',
            body: {
                inputMint: USDC_MINT,
                outputMint: input.outputMint,
                userAddress: walletPubkey,
                amount: inputAmount,
                orderType: 'dca',
            },
            ...auth,
        });
        const craftData = craft.data as { requestId?: string; transaction?: string };
        if (craft.status !== 200 || !craftData.requestId || !craftData.transaction) {
            throw new Error(`dca: deposit craft failed: ${errorMessage(craft.status, craft.data)}`);
        }

        const depositSignedTx = await signTransaction(craftData.transaction);
        await simulateSignedDeposit(depositSignedTx);

        const order = await authedRequest({
            method: 'POST',
            path: '/orders/dca',
            body: {
                depositRequestId: craftData.requestId,
                depositSignedTx,
                userPubkey: walletPubkey,
                inputMint: USDC_MINT,
                outputMint: input.outputMint,
                inputAmount,
                orderCount,
                intervalSeconds: input.intervalSec,
                orderType: 'time_based',
            },
            ...auth,
        });
        const orderData = order.data as { id?: string; txSignature?: string };
        if (order.status !== 200 || !orderData.id) {
            throw new Error(`dca: order create failed: ${errorMessage(order.status, order.data)}`);
        }

        return { orderId: orderData.id, txSignature: orderData.txSignature ?? '' };
    };

    for (let attempt = 0; ; attempt++) {
        try {
            return await attemptCreate();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const expired = /expired|without landing|blockhash|block height/i.test(message);
            if (!expired || attempt >= 1) {
                if (expired) {
                    throw new Error(
                        'The deposit expired before it could land — approve promptly in your wallet and try again.'
                    );
                }
                throw err;
            }
            // Fresh craft on the next attempt brings a fresh blockhash.
        }
    }
}

/**
 * Cancel a DCA order (the "Pause" path): two-step withdrawal that returns the
 * unfilled remainder to the user's wallet. One-way — no pause/resume; to
 * resume, cancel and create a new order.
 */
export async function cancelPlanOrder({
    walletPubkey,
    orderId,
    signMessage,
    signTransaction,
}: {
    walletPubkey: string;
    orderId: string;
    signMessage: SignMessageFn;
    signTransaction: SignTransactionFn;
}): Promise<{ txSignature: string }> {
    const auth = { walletPubkey, signMessage };

    const cancel = await authedRequest({
        method: 'POST',
        path: `/orders/dca/cancel/${orderId}`,
        ...auth,
    });
    const cancelData = cancel.data as { transaction?: string; requestId?: string };
    if (cancel.status !== 200 || !cancelData.transaction || !cancelData.requestId) {
        throw new Error(`dca: cancel failed: ${errorMessage(cancel.status, cancel.data)}`);
    }

    const signedTransaction = await signTransaction(cancelData.transaction);

    const confirm = await authedRequest({
        method: 'POST',
        path: `/orders/dca/confirm-cancel/${orderId}`,
        body: { signedTransaction, cancelRequestId: cancelData.requestId },
        ...auth,
    });
    const confirmData = confirm.data as { txSignature?: string };
    if (confirm.status !== 200) {
        throw new Error(
            `dca: confirm-cancel failed: ${errorMessage(confirm.status, confirm.data)}`
        );
    }

    return { txSignature: confirmData.txSignature ?? '' };
}

/**
 * Fetch one DCA order by id and normalize it. Returns null when the order is
 * not found or not owned by the wallet (404).
 */
export async function fetchPlanOrder({
    walletPubkey,
    orderId,
    signMessage,
}: {
    walletPubkey: string;
    orderId: string;
    signMessage: SignMessageFn;
}): Promise<PlanOrderSnapshot | null> {
    const res = await authedRequest({
        method: 'GET',
        path: `/orders/history/dca/${orderId}`,
        walletPubkey,
        signMessage,
    });
    if (res.status === 404) return null;
    if (res.status !== 200) {
        throw new Error(`dca: order fetch failed: ${errorMessage(res.status, res.data)}`);
    }
    const order = res.data as Record<string, unknown>;
    return {
        state: String(order.state ?? 'unknown'),
        roundsFilled: Number(order.roundsFilled ?? 0),
        numberOfRounds: Number(order.numberOfRounds ?? 0),
        inputAmountUsed: baseUnitsToUsdc(order.inputAmountUsed),
        inputAmountInitial: baseUnitsToUsdc(order.inputAmountInitial),
        outputAmountTotal: Number(order.outputAmountTotal ?? 0),
        amountPerRound: baseUnitsToUsdc(order.amountPerRound),
        nextFillAt: isoToUnixSeconds(order.nextFillAt),
        lastFillAt: isoToUnixSeconds(order.lastFillAt),
    };
}
