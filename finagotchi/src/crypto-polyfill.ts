// Minimal Node crypto polyfill for React Native.
// tweetnacl (pulled in by @phantom/crypto) calls require('crypto').randomBytes
// at load time. Hermes/JSC do not ship Node's crypto module, so we alias the
// built-in 'crypto' package to this file via metro.config.js.
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

export function randomBytes(size: number): Buffer {
    if (typeof size !== 'number' || size < 0 || size > 0x7fffffff) {
        throw new RangeError('randomBytes size must be a non-negative integer');
    }
    const bytes = new Uint8Array(size);
    globalThis.crypto.getRandomValues(bytes);
    return Buffer.from(bytes);
}
