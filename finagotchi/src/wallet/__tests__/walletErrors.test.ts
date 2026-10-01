import { describe, expect, it } from 'vitest';

import { toHumanReadableWalletError } from '../walletErrors';

/**
 * The new Dynamic SDK's typed errors are matched by name/code (not instanceof,
 * which breaks across the SDK's dual ESM/CJS boundary), so plain Errors with
 * the right name/code stand in for the SDK classes here. Names/codes verified
 * against the installed @dynamic-labs-sdk/*@1.33.4 dist.
 */
function sdkError(name: string, code: string, message: string): Error {
    const error = new Error(message);
    error.name = name;
    (error as unknown as { code: string }).code = code;
    return error;
}

describe('toHumanReadableWalletError — Dynamic SDK typed errors', () => {
    it('maps UserRejectedError to a cancellation message', () => {
        const error = sdkError(
            'UserRejectedError',
            'user_rejected',
            'User rejected action "connect"'
        );
        expect(toHumanReadableWalletError(error).message).toBe(
            'Cancelled in your wallet.'
        );
    });

    it('maps UserRejectedError by code even under a foreign name', () => {
        // If the SDK renames the class, the stable `code` still maps.
        const error = sdkError('BaseError', 'user_rejected', 'whatever');
        expect(toHumanReadableWalletError(error).message).toBe(
            'Cancelled in your wallet.'
        );
    });

    it('maps SessionClosedUnexpectedlyError to a reconnect prompt', () => {
        const error = sdkError(
            'SessionClosedUnexpectedlyError',
            'session_closed_unexpectedly_error',
            'WalletConnect session abc closed unexpectedly. Associated wallet was Phantom'
        );
        expect(toHumanReadableWalletError(error).message).toBe(
            'The wallet session expired — reconnect your wallet.'
        );
    });

    it('maps ValueMustBeDefinedError (WC project ID unset) without raw internals', () => {
        // The SDK names this class 'ValueMustBeDefined' (no 'Error' suffix).
        const error = sdkError(
            'ValueMustBeDefined',
            'value_must_be_defined_error',
            'walletConnectProjectId must be defined'
        );
        const mapped = toHumanReadableWalletError(error);
        expect(mapped.message).toBe(
            "The wallet connection isn't fully configured yet — please try again later."
        );
        expect(mapped.message).not.toContain('walletConnectProjectId');
    });

    it('still passes unknown errors through unchanged', () => {
        const error = new Error('something entirely new');
        expect(toHumanReadableWalletError(error)).toBe(error);
    });
});
