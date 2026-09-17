// Polyfills must run before any wallet SDK code is evaluated.
// The base64 polyfill is required by Dynamic's React Native SDK.
import '@react-native-anywhere/polyfill-base64';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';

if (typeof (globalThis as any).Buffer === 'undefined') {
    (globalThis as any).Buffer = Buffer;
}

// React Native Hermes/JSC do not expose a global crypto object, so ensure one
// is present. Some libraries (WalletConnect, @noble/hashes) read
// crypto.getRandomValues synchronously at module load time, so this polyfill
// must run before any of those modules are imported.
if (typeof globalThis.crypto !== 'object' || globalThis.crypto === null) {
    (globalThis as any).crypto = {} as Crypto;
}

function installCryptoGetRandomValues() {
    const original = (globalThis as any).crypto.getRandomValues;
    if (typeof original === 'function') {
        return;
    }

    (globalThis as any).crypto.getRandomValues = (
        array: Uint8Array | ArrayBufferView
    ): Uint8Array | ArrayBufferView => {
        // Prefer the native implementation if it has become available.
        if (typeof original === 'function') {
            return original.call((globalThis as any).crypto, array);
        }

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

installCryptoGetRandomValues();

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
