/**
 * Maps raw wallet/chain errors (MWA Java exceptions, Dynamic SDK errors, RPC
 * failures) to messages a human can act on. Unknown errors pass through
 * unchanged so genuinely new failures aren't hidden behind a generic string.
 */
export function toHumanReadableWalletError(error: unknown): Error {
    const raw =
        error instanceof Error
            ? error.message
            : String(error ?? 'Unknown error');
    const normalized = raw.toLowerCase();
    const friendly = (message: string) => new Error(message);

    // Typed errors from the new Dynamic SDK (@dynamic-labs-sdk/client and
    // /wallet-connect). instanceof is unreliable across the SDK's dual
    // ESM/CJS boundary (two copies of the class can exist), so match on the
    // error's `name`/`code` — verified against the installed 1.33.4 dist.
    const errorName = (
        typeof (error as { name?: unknown })?.name === 'string'
            ? ((error as { name: string }).name)
            : ''
    ).toLowerCase();
    const errorCode = (
        typeof (error as { code?: unknown })?.code === 'string'
            ? ((error as { code: string }).code)
            : ''
    ).toLowerCase();

    // UserRejectedError: user declined the connect/sign prompt in their wallet.
    if (errorName === 'userrejectederror' || errorCode === 'user_rejected') {
        return friendly('Cancelled in your wallet.');
    }
    // SessionClosedUnexpectedlyError: the WalletConnect session died mid-flow.
    if (
        errorName === 'sessionclosedunexpectedlyerror' ||
        errorCode === 'session_closed_unexpectedly_error'
    ) {
        return friendly(
            'The wallet session expired — reconnect your wallet.'
        );
    }
    // ValueMustBeDefinedError (name is 'ValueMustBeDefined' — no 'Error'
    // suffix): getSignClient throws this when the WalletConnect project ID or
    // app display name is unset in the Dynamic dashboard. App-side
    // misconfiguration, not something the user did.
    if (
        errorName === 'valuemustbedefined' ||
        errorName === 'valuemustbedefinederror' ||
        errorCode === 'value_must_be_defined_error'
    ) {
        return friendly(
            "The wallet connection isn't fully configured yet — please try again later."
        );
    }

    // User dismissed the wallet sheet/prompt (MWA surfaces this on Android as
    // "java.util.concurrent.CancellationException").
    if (
        /cancellationexception|cancelled|canceled|user rejected|rejected by (the )?user|user declined|user denied/.test(
            normalized
        )
    ) {
        return friendly('Cancelled in your wallet.');
    }
    if (
        /authorization request failed|reauthoriz|not authorized|not signed in|session expired|chain not supported/.test(
            normalized
        )
    ) {
        return friendly(
            'Wallet authorization failed — please reconnect your wallet.'
        );
    }
    if (
        /insufficient funds|insufficient lamports|insufficient balance|attempt to debit|exceeds balance/.test(
            normalized
        )
    ) {
        return friendly(
            'Not enough SOL to cover this transaction and its network fee.'
        );
    }
    if (/blockhash|block height exceeded|transaction expired|timed? out/.test(normalized)) {
        return friendly(
            'The transaction expired before it could confirm — please try again.'
        );
    }
    if (
        /network request failed|failed to fetch|fetch failed|econn|enotfound|etimedout|socket hang up/.test(
            normalized
        )
    ) {
        return friendly('Network error — check your connection and try again.');
    }
    if (/\botp\b|one.?time|verification code/.test(normalized)) {
        return friendly("That code doesn't look right — try again.");
    }
    if (
        /unexpected account address format|no wallet account returned|invalid wallet address/.test(
            normalized
        )
    ) {
        return friendly(
            "Your wallet returned an account we couldn't read — try reconnecting."
        );
    }
    if (
        /no dynamic solana wallet available|no active wallet connection|wallet not connected/.test(
            normalized
        )
    ) {
        return friendly('Wallet not connected — reconnect and try again.');
    }
    if (/wallet_creation_failed|multiple wallets per chain/.test(normalized)) {
        return friendly(
            'Your account already has a wallet — sign out and back in to reload it.'
        );
    }
    // WalletConnect proposal TTL (~5 min) elapsed before the user approved in
    // their wallet app.
    if (/proposal expired|proposal_expire/.test(normalized)) {
        return friendly(
            'The connection request expired — start it again and approve promptly in your wallet.'
        );
    }
    if (/transaction simulation failed|custom program error|instructionerror/.test(normalized)) {
        return friendly('Solana rejected the transaction — please try again.');
    }
    if (/missing signature|signature verification failed/.test(normalized)) {
        return friendly(
            "Your wallet's signature didn't make it onto the transaction — please try again."
        );
    }
    // The technical dump from quest-engine/signatureBytes.ts when a signer
    // returns something that isn't a 64-byte ed25519 signature.
    if (/did not return an ed25519 signature/.test(normalized)) {
        return friendly(
            'The wallet returned an unreadable signature — please try again.'
        );
    }
    // A JSON-RPC 403 from the wallet's RPC endpoint (e.g. a Helius key whose
    // origin allowlist doesn't cover Dynamic's webview origin). Checked BEFORE
    // the export branch: "access forbidden" is not a key-export failure.
    if (/access forbidden|"code":\s*403|\b403\b/.test(normalized)) {
        return friendly(
            'The wallet RPC refused the request (403) — the RPC API key likely has an origin restriction. Remove it or allow the wallet origin, then try again.'
        );
    }
    // Dynamic rejects key export with WalletApiError: Forbidden when the
    // dashboard's "Private Key Exports" toggle is off. Only reachable from
    // the export flow — a bare "forbidden" elsewhere is NOT this (see 403 above).
    if (/export (private )?keys? (is )?(disabled|not allowed)|revealembeddedwalletkey|wallet:export/.test(normalized)) {
        return friendly("Key export isn't available for this wallet right now.");
    }
    if (/invalid deposit transaction|accounts modified/.test(normalized)) {
        return friendly(
            "This wallet can't sign Jupiter DCA deposits — it alters the transaction before signing. Try Phantom, or connect with email/passkey instead."
        );
    }
    if (/not properly formed|cannot be signed|can't be signed|rewrote the deposit/.test(normalized)) {
        return friendly(
            "This wallet can't sign Jupiter DCA deposits — it rewrites transactions before signing. Try Phantom, or connect with email/passkey instead."
        );
    }

    return error instanceof Error ? error : new Error(raw);
}

/**
 * Re-throws any error from `fn` as a human-readable wallet error, so every
 * screen that surfaces `error.message` gets copy the user can act on.
 */
export function withHumanReadableErrors<A extends unknown[], R>(
    fn: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
    return async (...args: A) => {
        try {
            return await fn(...args);
        } catch (error) {
            throw toHumanReadableWalletError(error);
        }
    };
}
