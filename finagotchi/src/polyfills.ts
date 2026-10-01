// Polyfills must run before any wallet SDK code is evaluated.
// The WalletConnect shim is FIRST: it installs the globals the WalletConnect
// sign client expects (crypto, encoding, event targets) and must precede
// every other shim (Dynamic WalletConnect integration docs, RN setup).
import '@walletconnect/react-native-compat';
// The base64 polyfill is required by Dynamic's React Native SDK.
import '@react-native-anywhere/polyfill-base64';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';
import { installWebGlobals } from './webGlobals';

// window/Event/EventTarget shims for browser-oriented wallet SDK code
// (wallet-standard registration in @dynamic-labs-sdk/solana). Must run before
// any @dynamic-labs-sdk module is evaluated; see webGlobals.ts for details.
installWebGlobals();

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

if (typeof (globalThis as any).crypto.getRandomValues !== 'function') {
    // react-native-get-random-values installs crypto.getRandomValues on import
    // (it prefers ExpoCrypto when linked, else its own RNGetRandomValues
    // native module). Reaching this branch means neither path installed it —
    // a broken build. Fail LOUDLY at call time: a Math.random()-based fallback
    // would silently weaken wallet keys and signatures, which is worse than a
    // crash.
    (globalThis as any).crypto.getRandomValues = (): never => {
        throw new Error(
            '[finagotchi] crypto.getRandomValues is unavailable: ' +
                'react-native-get-random-values did not install it (its ' +
                'RNGetRandomValues native module is missing from this build). ' +
                'Rebuild the dev client / EAS build so secure randomness is ' +
                'linked. No insecure fallback is provided on purpose.'
        );
    };
}

// Also expose a minimal randomBytes for libraries that check Node's crypto.
// Backed by crypto.getRandomValues — never Math.random (see above).
if (typeof (globalThis as any).crypto.randomBytes !== 'function') {
    (globalThis as any).crypto.randomBytes = (size: number) => {
        const bytes = new Uint8Array(size);
        (globalThis as any).crypto.getRandomValues(bytes);
        return Buffer.from(bytes);
    };
}
