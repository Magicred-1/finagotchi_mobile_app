/**
 * Jupiter Swap API v2 client (meta-aggregator /order + /execute), reached
 * through the API server's /jup-swap proxy — the Jupiter API key and the
 * integrator referral account both live server-side.
 *
 * This module NEVER holds keys. Auth is the quest-engine session JWT (the
 * proxy's requireWalletAccess checks it against a wallet=<address> query
 * param). The swap transaction is signed by the wallet layer's injected
 * callback and Jupiter lands it — the app never sends it itself.
 *
 * Docs: https://developers.jup.ag/docs/swap/order-and-execute
 */

import type { SupportedToken } from '../dca/types';

/**
 * Lazy: the quest-engine client pulls in expo-constants and the onboarding
 * store, so it must not load at bundle evaluation (same services→features
 * lazy-import precedent as the DCA client).
 */
async function questEngineClient() {
    return import('../../features/quest-engine/client');
}

/**
 * Every Swap API call goes through the API server's /jup-swap proxy, which
 * injects the Jupiter API key AND the integrator referral fee server-side —
 * neither is bundled in the app, and a tampered client cannot strip the fee.
 */
async function jupSwapBaseUrl(): Promise<string> {
    const { getQuestServerBaseUrl } = await questEngineClient();
    return `${getQuestServerBaseUrl()}/jup-swap`;
}

/**
 * The proxy's requireWalletAccess middleware demands a wallet=<address> query
 * param on EVERY request and checks it against the session JWT's sub
 * (mismatch → 401). The proxy strips it before forwarding, so it never
 * reaches Jupiter.
 */
function withWalletParam(url: string, walletPubkey: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}wallet=${encodeURIComponent(walletPubkey)}`;
}

/**
 * Session JWT for the API server (the same one the quest engine gets from
 * /auth/login). There is no bundled-key fallback: without server sign-in
 * consent there is no session, and the proxy rejects the call.
 */
async function serverSessionToken(walletPubkey: string): Promise<string> {
    const { ensureAuthToken, QuestClientError } = await questEngineClient();
    try {
        return await ensureAuthToken(walletPubkey);
    } catch (err) {
        if (err instanceof QuestClientError && err.code === 'signer') {
            throw new Error(
                'swap: server sign-in required: complete the server sign-in step ' +
                    '(onboarding) to swap. Jupiter calls are proxied through our server.'
            );
        }
        throw err;
    }
}

/**
 * Signs (without sending) a base64 transaction, returning the signed
 * transaction as base64. Injected by the wallet layer.
 */
export type SignTransactionFn = (base64Tx: string) => Promise<string>;

/** Normalized quote (no transaction) for display while the user types. */
export interface SwapQuote {
    inputMint: string;
    outputMint: string;
    /** Input amount in base units, echo of the request. */
    inAmount: string;
    /** Expected output in base units, before slippage and any output-mint fee. */
    outAmount: string;
    /** Total fee rate Jupiter charges (bps), integrator fee included. */
    feeBps: number;
    /** Mint the fee is collected in; null when the quote omits it. */
    feeMint: string | null;
}

/** Quote + assembled transaction, ready to sign and execute. */
export interface SwapOrder extends SwapQuote {
    /** Base64-encoded transaction to sign. */
    transaction: string;
    /** Passed to /execute. */
    requestId: string;
    /** Winning router ('metis' | 'dflow' | 'okx' — jupiterz is excluded server-side). */
    router: string;
}

export interface SwapExecuteResult {
    status: 'Success' | 'Failed';
    signature: string;
    code: number;
    /** Final input deducted from the wallet (base units, input-mint fee included). */
    totalInputAmount?: string;
    /** Final output reflected in the wallet (base units, output-mint fee deducted). */
    totalOutputAmount?: string;
    error?: string;
}

// Test seam: lets vitest/node smoke tests inject a fake fetch.
type FetchImpl = typeof fetch;
let fetchImpl: FetchImpl | null = null;

/** Override the fetch implementation (pass null to restore the global). */
export function setSwapFetchImpl(impl: FetchImpl | null): void {
    fetchImpl = impl;
}

function getFetch(): FetchImpl {
    return fetchImpl ?? globalThis.fetch;
}

/** Quotes die fast; an order is signed within seconds of being crafted. */
const QUOTE_TIMEOUT_MS = 15_000;
/** /execute polls for landing; give it room under the proxy's 60s upstream cap. */
const EXECUTE_TIMEOUT_MS = 45_000;

/** fetch() with an abort timeout (same black-hole guard as the DCA client). */
async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await getFetch()(url, { ...init, signal: controller.signal });
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error('network request failed: timed out');
        }
        throw err;
    } finally {
        clearTimeout(timer);
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
        try {
            const dump = JSON.stringify(body);
            return dump.length > 500 ? `${dump.slice(0, 500)}…` : dump;
        } catch {
            // fall through
        }
    }
    return `HTTP ${status}`;
}

interface AuthedResponse {
    status: number;
    data: unknown;
}

/** Authenticated request through the proxy; on a proxy 401 the session JWT is refreshed once. */
async function authedRequest({
    method,
    path,
    query,
    body,
    walletPubkey,
    timeoutMs,
}: {
    method: 'GET' | 'POST';
    path: string;
    query?: Record<string, string>;
    body?: unknown;
    walletPubkey: string;
    timeoutMs: number;
}): Promise<AuthedResponse> {
    let sessionToken = await serverSessionToken(walletPubkey);
    const baseUrl = await jupSwapBaseUrl();
    const qs = query ? `?${new URLSearchParams(query).toString()}` : '';

    for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetchWithTimeout(
            withWalletParam(baseUrl + path + qs, walletPubkey),
            {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionToken}`,
                },
                body: body === undefined ? undefined : JSON.stringify(body),
            },
            timeoutMs
        );
        if (res.status === 401 && attempt === 0) {
            // Our proxy gate returns {error:'unauthorized'} — refresh the
            // session token once, same retry contract as the DCA client.
            const body = (await readBody(res)) as { error?: unknown } | null;
            if (body?.error === 'unauthorized') {
                const { clearAuthSession } = await questEngineClient();
                await clearAuthSession();
                sessionToken = await serverSessionToken(walletPubkey);
                continue;
            }
        }
        return { status: res.status, data: await readBody(res) };
    }
    throw new Error('swap: unreachable');
}

function normalizeQuote(data: Record<string, unknown>): SwapQuote {
    return {
        inputMint: String(data.inputMint ?? ''),
        outputMint: String(data.outputMint ?? ''),
        inAmount: String(data.inAmount ?? '0'),
        outAmount: String(data.outAmount ?? '0'),
        feeBps: Number(data.feeBps ?? 0),
        feeMint: typeof data.feeMint === 'string' ? data.feeMint : null,
    };
}

/**
 * Human-readable cause for an order that quoted a price but could not build
 * a transaction (transaction === ""). Aggregator errorCode meanings per
 * https://developers.jup.ag/docs/swap/order-and-execute#order-error-codes.
 */
function orderBuildError(data: Record<string, unknown>): string {
    const code = Number(data.errorCode ?? 0);
    if (code === 1) {
        return 'Insufficient balance for this swap. Lower the amount or top up the input token.';
    }
    if (code === 2) {
        return 'Your wallet needs a little SOL for network fees to place this swap.';
    }
    return 'This pair cannot be swapped right now. Try a different amount or token.';
}

/** Integer-exact base units for a token amount, as a string. */
export function toBaseUnits(amount: number, token: SupportedToken): string {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`swap: amount must be a positive finite number, got ${amount}`);
    }
    return String(Math.round(amount * 10 ** token.decimals));
}

export function fromBaseUnits(value: string | undefined, token: SupportedToken): number {
    return Number(value ?? 0) / 10 ** token.decimals;
}

/**
 * Price check while the user types: /order WITHOUT a taker returns a quote
 * with no transaction, so nothing is built or cached server-side per keystroke.
 * Throws on HTTP errors; callers treat a throw as "no quote" and keep the
 * last good one or show the placeholder.
 */
export async function getSwapQuote({
    walletPubkey,
    inputMint,
    outputMint,
    amount,
}: {
    walletPubkey: string;
    inputMint: string;
    outputMint: string;
    /** Input amount in base units. */
    amount: string;
}): Promise<SwapQuote> {
    const res = await authedRequest({
        method: 'GET',
        path: '/order',
        query: { inputMint, outputMint, amount },
        walletPubkey,
        timeoutMs: QUOTE_TIMEOUT_MS,
    });
    if (res.status !== 200) {
        throw new Error(`swap: quote failed: ${errorMessage(res.status, res.data)}`);
    }
    return normalizeQuote(res.data as Record<string, unknown>);
}

/**
 * Fresh quote + assembled transaction (taker set), to be signed and executed
 * IMMEDIATELY — quotes go stale as on-chain prices move. Throws a friendly
 * message when Jupiter can quote but cannot build (insufficient funds/gas).
 */
export async function getSwapOrder({
    walletPubkey,
    inputMint,
    outputMint,
    amount,
}: {
    walletPubkey: string;
    inputMint: string;
    outputMint: string;
    amount: string;
}): Promise<SwapOrder> {
    const res = await authedRequest({
        method: 'GET',
        path: '/order',
        query: { inputMint, outputMint, amount, taker: walletPubkey },
        walletPubkey,
        timeoutMs: QUOTE_TIMEOUT_MS,
    });
    if (res.status !== 200) {
        throw new Error(`swap: order failed: ${errorMessage(res.status, res.data)}`);
    }
    const data = res.data as Record<string, unknown>;
    if (typeof data.transaction !== 'string' || data.transaction === '') {
        throw new Error(orderBuildError(data));
    }
    if (typeof data.requestId !== 'string' || data.requestId === '') {
        throw new Error('swap: order failed: missing requestId');
    }
    return {
        ...normalizeQuote(data),
        transaction: data.transaction,
        requestId: data.requestId,
        router: String(data.router ?? 'unknown'),
    };
}

/**
 * /execute rejects any wallet-modified transaction. Wallets that append
 * protection instructions — Seeker's Lighthouse assertions — can never pass;
 * translate the raw rejection into actionable guidance instead of a cryptic
 * "invalid transaction".
 */
function executeFailureGuidance(raw: string): string {
    if (!/invalid (signed )?transaction/i.test(raw)) return raw;
    return (
        "Your wallet rewrote Jupiter's swap transaction (Seeker devices attach a " +
        'Lighthouse security assertion), and Jupiter rejects any modified transaction. ' +
        'Use the embedded wallet or Phantom/Backpack on your device to swap.'
    );
}

/** Execute a signed order; Jupiter handles landing and confirmation polling. */
export async function executeSwap({
    walletPubkey,
    signedTransaction,
    requestId,
}: {
    walletPubkey: string;
    signedTransaction: string;
    requestId: string;
}): Promise<SwapExecuteResult> {
    const res = await authedRequest({
        method: 'POST',
        path: '/execute',
        body: { signedTransaction, requestId },
        walletPubkey,
        timeoutMs: EXECUTE_TIMEOUT_MS,
    });
    if (res.status !== 200) {
        throw new Error(
            `swap: execute failed: ${executeFailureGuidance(errorMessage(res.status, res.data))}`
        );
    }
    const data = res.data as Record<string, unknown>;
    const result: SwapExecuteResult = {
        status: data.status === 'Success' ? 'Success' : 'Failed',
        signature: String(data.signature ?? ''),
        code: Number(data.code ?? -1),
        totalInputAmount:
            typeof data.totalInputAmount === 'string' ? data.totalInputAmount : undefined,
        totalOutputAmount:
            typeof data.totalOutputAmount === 'string' ? data.totalOutputAmount : undefined,
        error: typeof data.error === 'string' ? data.error : undefined,
    };
    if (result.status !== 'Success') {
        throw new Error(
            executeFailureGuidance(
                result.error ??
                    'The swap could not be executed. The quote likely went stale. Nothing was swapped; try again.'
            )
        );
    }
    return result;
}

/** Stages of the swap flow, reported so the UI can show where a slow flow is. */
export type SwapStep = 'quote' | 'sign' | 'execute';

export type SwapStepFn = (step: SwapStep) => void;

/**
 * Full swap: fresh order → wallet signature → managed execution. The order is
 * crafted as late as possible (on confirm, not while typing) so the signature
 * always covers a live quote.
 */
export async function performSwap({
    walletPubkey,
    signTransaction,
    input,
    onStep,
}: {
    walletPubkey: string;
    signTransaction: SignTransactionFn;
    input: { inputMint: string; outputMint: string; amount: string };
    onStep?: SwapStepFn;
}): Promise<{ order: SwapOrder; result: SwapExecuteResult }> {
    onStep?.('quote');
    const order = await getSwapOrder({ walletPubkey, ...input });

    onStep?.('sign');
    const signedTransaction = await signTransaction(order.transaction);

    onStep?.('execute');
    const result = await executeSwap({
        walletPubkey,
        signedTransaction,
        requestId: order.requestId,
    });
    return { order, result };
}
