import { Buffer } from 'buffer';
import bs58 from 'bs58';

/**
 * Normalizes a wallet-returned ed25519 signature to raw 64 bytes.
 *
 * The Dynamic SDK's WebView bridge JSON-serializes return values, so the
 * signature can arrive as a Uint8Array, a plain number[], an object with
 * numeric keys ({'0': 210, …}), or an encoded string (bs58/base64/hex).
 * Anything else throws with a description of what actually showed up.
 */
export function normalizeSignatureBytes(signature: unknown, source: string): Uint8Array {
    if (signature instanceof Uint8Array && signature.length === 64) {
        return signature;
    }
    if (
        Array.isArray(signature) &&
        signature.length === 64 &&
        signature.every((n) => typeof n === 'number')
    ) {
        return Uint8Array.from(signature as number[]);
    }
    if (typeof signature === 'string') {
        const decoders = [
            (s: string) => bs58.decode(s),
            (s: string) => new Uint8Array(Buffer.from(s, 'base64')),
            (s: string) => new Uint8Array(Buffer.from(s, 'hex')),
        ];
        for (const decode of decoders) {
            try {
                const bytes = decode(signature);
                if (bytes.length === 64) return bytes;
            } catch {
                // Try the next encoding.
            }
        }
    }
    if (signature && typeof signature === 'object') {
        const keys = Object.keys(signature);
        if (keys.length === 64 && keys.every((k) => /^\d+$/.test(k))) {
            const out = new Uint8Array(64);
            for (const k of keys) {
                out[Number(k)] = (signature as Record<string, number>)[k];
            }
            return out;
        }
    }

    let description: string;
    if (signature === null || signature === undefined) {
        description = String(signature);
    } else if (Array.isArray(signature)) {
        description = `array of ${signature.length}`;
    } else if (typeof signature === 'object') {
        description = `object with ${Object.keys(signature).length} keys`;
    } else {
        description = `${typeof signature} (length ${(signature as { length?: unknown }).length ?? 'n/a'})`;
    }
    throw new Error(`${source} did not return an ed25519 signature (got ${description})`);
}
