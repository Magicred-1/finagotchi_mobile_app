import { dynamicClient } from './dynamicClient';

/**
 * Dynamic's signing transport lives in a hosted web page inside the native
 * overlay webview. When that page fails to load (offline at boot, ATS or a
 * bad hosted deploy), signing requests vanish into a dead channel and the
 * returned promise NEVER settles — from the user's side the app simply
 * ignores the tap. The client exposes the load lifecycle via `sdk.loadState`
 * plus a self-healing `sdk.retry()`, so gate every Dynamic signing request
 * on the transport being ready and fail fast with an actionable error.
 */
export const DYNAMIC_TRANSPORT_READY_TIMEOUT_MS = 30_000;
/** A stuck prompt must not spin forever; 3 minutes covers slow biometrics. */
export const WALLET_SIGNING_TIMEOUT_MS = 3 * 60_000;

export function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}

export async function ensureDynamicSignerReady(): Promise<void> {
    const sdk = dynamicClient.sdk;
    if (sdk.loadState.status === 'ready') return;

    // Give an in-flight load a bounded window…
    try {
        await withTimeout(
            sdk.waitForReady(),
            DYNAMIC_TRANSPORT_READY_TIMEOUT_MS,
            'wallet service load timed out'
        );
        return;
    } catch {
        // …then force one retry cycle (retry() resolves on the next
        // ready/failed transition, or immediately with the current state).
    }
    const status = (await sdk.retry()).status;
    if (status === 'ready') return;
    throw new Error(
        'The wallet service failed to start — check your connection, then force-close and reopen the app.'
    );
}
