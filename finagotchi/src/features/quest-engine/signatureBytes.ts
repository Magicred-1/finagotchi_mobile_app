import { Buffer } from 'buffer';
import bs58 from 'bs58';

/**
 * Normalizes a wallet-returned ed25519 signature to raw 64 bytes.
 *
 * The Dynamic SDK's WebView bridge JSON-serializes return values, so the
 * signature can arrive as a Uint8Array, a plain number[], an object with
 * numeric keys ({'0': 210, …}), or an encoded string (bs58/base64/hex).
 * On the native embedded-webview path the encoded STRING itself gets spread
 * into a numeric-keyed object ({'0': 'F', '1': 'q', …} — 88 keys for a
 * base64 signature) or its char codes ({'0': 70, '1': 113, …}), so those
 * shapes are reassembled and decoded too.
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
        if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
            const values = keys
                .map(Number)
                .sort((a, b) => a - b)
                .map((i) => (signature as Record<string, unknown>)[i]);
            if (values.every((v) => typeof v === 'number')) {
                const bytes = Uint8Array.from(values as number[]);
                if (bytes.length === 64) return bytes;
                // Char-CODE spread of an encoded string (bridge artifact):
                // reinterpret the bytes as UTF-8 and decode that.
                return normalizeSignatureBytes(
                    Buffer.from(bytes).toString('utf8'),
                    source
                );
            }
            // Char-spread string (native bridge): reassemble and decode.
            if (values.every((v) => typeof v === 'string' && v.length === 1)) {
                return normalizeSignatureBytes(values.join(''), source);
            }
        }
    }

    let description: string;
    if (signature === null || signature === undefined) {
        description = String(signature);
    } else if (Array.isArray(signature)) {
        description = `array of ${signature.length}`;
    } else if (typeof signature === 'object') {
        const keys = Object.keys(signature);
        const sample = keys
            .slice(0, 3)
            .map(
                (k) =>
                    `${k}=${JSON.stringify(
                        (signature as Record<string, unknown>)[k]
                    )}`
            )
            .join(', ');
        description = `object with ${keys.length} keys (${sample})`;
    } else {
        description = `${typeof signature} (length ${(signature as { length?: unknown }).length ?? 'n/a'})`;
    }
    throw new Error(`${source} did not return an ed25519 signature (got ${description})`);
}
