// Polyfill for Event constructor used by @dynamic-labs-sdk/client in React Native.
if (typeof (globalThis as any).Event !== 'function') {
    class EventPolyfill {
        type: string;
        constructor(type: string) {
            this.type = type;
        }
    }
    (globalThis as any).Event = EventPolyfill as any;
}

// Polyfills must run before any wallet SDK code is evaluated.
// The base64 polyfill is required by Dynamic's React Native SDK.
import '@react-native-anywhere/polyfill-base64';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';

if (typeof (globalThis as any).Buffer === 'undefined') {
    (globalThis as any).Buffer = Buffer;
}

// @solana/web3.js -> @noble/curves -> @noble/hashes checks for
// globalThis.crypto.getRandomValues at module evaluation time. React Native
// Hermes/JSC do not expose a global crypto object, so ensure one is present.
if (typeof globalThis.crypto !== 'object' || globalThis.crypto === null) {
    (globalThis as any).crypto = {} as Crypto;
}

// react-native-get-random-values should have installed the real native
// getRandomValues. If for some reason it did not (e.g. remote debugging or
// missing native module), install a Math.random() fallback so that
// Keypair.generate() and other Solana calls do not hard-crash.
if (typeof globalThis.crypto.getRandomValues !== 'function') {
    (globalThis as any).crypto.getRandomValues = (
        array: Uint8Array | ArrayBufferView
    ): Uint8Array | ArrayBufferView => {
        const view =
            array instanceof ArrayBuffer
                ? new Uint8Array(array)
                : (array as Uint8Array);
        for (let i = 0; i < view.length; i++) {
            view[i] = Math.floor(Math.random() * 256);
        }
        return array;
    };
}

// Also expose a minimal randomBytes for libraries that check Node's crypto.
if (typeof (globalThis as any).crypto.randomBytes !== 'function') {
    (globalThis as any).crypto.randomBytes = (size: number) => {
        const bytes = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
        return Buffer.from(bytes);
    };
}
