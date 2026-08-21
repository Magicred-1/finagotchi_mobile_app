// @ts-nocheck
// Polyfills must run before any wallet SDK code is evaluated.
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';

if (typeof (globalThis as any).Buffer === 'undefined') {
    (globalThis as any).Buffer = Buffer;
}

// iOS JSC/Hermes does not ship with WebCrypto, which Phantom's Auth2 stamper
// needs for crypto.subtle.generateKey/exportKey/importKey/sign/digest. We
// provide a minimal pure-JS SubtleCrypto implementation backed by Noble curves
// for ECDSA P-256 / SHA-256 only.

const P256_PKCS8_HEADER_HEX =
    '3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420';

function hexToBytes(hex: string): Uint8Array {
    const pairs = hex.match(/[0-9a-f]{2}/gi);
    if (!pairs || pairs.length * 2 !== hex.length) {
        throw new Error('invalid hex');
    }
    return Uint8Array.from(pairs, (b) => Number.parseInt(b, 16));
}

const P256_PKCS8_HEADER = hexToBytes(P256_PKCS8_HEADER_HEX);

function u8FromInput(input: ArrayBuffer | ArrayBufferView): Uint8Array {
    if (input instanceof Uint8Array) return input;
    if (ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    return new Uint8Array(input);
}

function base64UrlEncode(bytes: Uint8Array): string {
    const base64 = Buffer.from(bytes).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function assertP256Algorithm(algorithm: any): void {
    if (
        !algorithm ||
        algorithm.name !== 'ECDSA' ||
        algorithm.namedCurve !== 'P-256'
    ) {
        throw new Error(
            'Unsupported algorithm: only ECDSA P-256 is supported'
        );
    }
}

function assertUsage(required: string, usages: string[]): void {
    if (!usages.includes(required)) {
        throw new Error(`Key usage '${required}' is not permitted`);
    }
}

class P256CryptoKey {
    constructor(
        public readonly type: 'private' | 'public',
        public readonly extractable: boolean,
        public readonly algorithm: { name: string; namedCurve: string },
        public readonly usages: string[],
        public readonly _material: Uint8Array
    ) {}
}

function generatePrivateKey(): Uint8Array {
    // p256.keygen() returns a freshly generated secret key using the runtime's
    // CSPRNG (wired up by react-native-get-random-values on React Native).
    return p256.keygen().secretKey;
}

function getPublicKeyUncompressed(secretKey: Uint8Array): Uint8Array {
    return p256.getPublicKey(secretKey, false);
}

const subtle: SubtleCrypto = {
    async generateKey(
        algorithm: any,
        extractable: boolean,
        keyUsages: string[]
    ): Promise<CryptoKeyPair> {
        assertP256Algorithm(algorithm);
        if (!keyUsages.includes('sign') || !keyUsages.includes('verify')) {
            throw new Error(
                'generateKey only supports sign+verify usages for P-256'
            );
        }

        const privateBytes = generatePrivateKey();
        const publicBytes = getPublicKeyUncompressed(privateBytes);

        const algorithmInfo = { name: 'ECDSA', namedCurve: 'P-256' };

        const privateKey = new P256CryptoKey(
            'private',
            extractable,
            algorithmInfo,
            ['sign'],
            privateBytes
        ) as unknown as CryptoKey;
        const publicKey = new P256CryptoKey(
            'public',
            extractable,
            algorithmInfo,
            ['verify'],
            publicBytes
        ) as unknown as CryptoKey;

        return { privateKey, publicKey };
    },

    async exportKey(format: any, key: any): Promise<ArrayBuffer | JsonWebKey> {
        if (!(key instanceof P256CryptoKey)) {
            throw new Error('Invalid key');
        }

        if (format === 'raw' && key.type === 'public') {
            return u8FromInput(key._material).buffer.slice(
                key._material.byteOffset,
                key._material.byteOffset + key._material.byteLength
            );
        }

        if (format === 'jwk' && key.type === 'public') {
            const bytes = u8FromInput(key._material);
            if (bytes.length !== 65 || bytes[0] !== 0x04) {
                throw new Error('Cannot export non-uncompressed P-256 public key as JWK');
            }
            const x = bytes.subarray(1, 33);
            const y = bytes.subarray(33, 65);
            return {
                kty: 'EC',
                crv: 'P-256',
                x: base64UrlEncode(x),
                y: base64UrlEncode(y),
                ext: key.extractable,
                key_ops: key.usages,
            };
        }

        if (format === 'pkcs8' && key.type === 'private') {
            if (!key.extractable) {
                throw new Error('key is not extractable');
            }
            const bytes = u8FromInput(key._material);
            if (bytes.length !== 32) {
                throw new Error('Invalid P-256 private key length');
            }
            const out = new Uint8Array(P256_PKCS8_HEADER.length + 32);
            out.set(P256_PKCS8_HEADER, 0);
            out.set(bytes, P256_PKCS8_HEADER.length);
            return out.buffer;
        }

        throw new Error(`Unsupported export: ${format} for ${key.type} key`);
    },

    async importKey(
        format: any,
        keyData: any,
        algorithm: any,
        extractable: boolean,
        keyUsages: string[]
    ): Promise<CryptoKey> {
        assertP256Algorithm(algorithm);
        const algorithmInfo = { name: 'ECDSA', namedCurve: 'P-256' };

        if (format === 'raw') {
            const bytes = u8FromInput(keyData);
            if (bytes.length !== 65 || bytes[0] !== 0x04) {
                throw new Error(
                    'Unsupported P-256 public key format (expected 65-byte uncompressed)'
                );
            }
            return new P256CryptoKey(
                'public',
                extractable,
                algorithmInfo,
                keyUsages.length ? keyUsages : ['verify'],
                bytes
            ) as unknown as CryptoKey;
        }

        if (format === 'pkcs8') {
            const bytes = u8FromInput(keyData);
            if (
                bytes.length !==
                P256_PKCS8_HEADER.length + 32
            ) {
                throw new Error('Invalid P-256 PKCS8 key length');
            }
            for (let i = 0; i < P256_PKCS8_HEADER.length; i++) {
                if (bytes[i] !== P256_PKCS8_HEADER[i]) {
                    throw new Error('Invalid P-256 PKCS8 header');
                }
            }
            const privateBytes = bytes.subarray(P256_PKCS8_HEADER.length);
            return new P256CryptoKey(
                'private',
                extractable,
                algorithmInfo,
                keyUsages.length ? keyUsages : ['sign'],
                privateBytes
            ) as unknown as CryptoKey;
        }

        throw new Error(`Unsupported import format: ${format}`);
    },

    async sign(
        algorithm: any,
        key: any,
        data: ArrayBuffer | ArrayBufferView
    ): Promise<ArrayBuffer> {
        if (!(key instanceof P256CryptoKey) || key.type !== 'private') {
            throw new Error('sign expects a private CryptoKey');
        }
        if (!algorithm || algorithm.name !== 'ECDSA') {
            throw new Error('sign only supports ECDSA');
        }
        const hashName =
            typeof algorithm.hash === 'string'
                ? algorithm.hash
                : algorithm.hash?.name;
        if (hashName !== 'SHA-256') {
            throw new Error('sign only supports SHA-256');
        }
        assertUsage('sign', key.usages);

        const message = u8FromInput(data);
        const signature = p256.sign(message, key._material, {
            prehash: true,
            lowS: true,
            format: 'der',
        });
        const sigBytes = signature.toBytes('der');
        return sigBytes.buffer.slice(
            sigBytes.byteOffset,
            sigBytes.byteOffset + sigBytes.byteLength
        );
    },

    async verify(
        algorithm: any,
        key: any,
        signature: ArrayBuffer | ArrayBufferView,
        data: ArrayBuffer | ArrayBufferView
    ): Promise<boolean> {
        if (!(key instanceof P256CryptoKey) || key.type !== 'public') {
            throw new Error('verify expects a public CryptoKey');
        }
        if (!algorithm || algorithm.name !== 'ECDSA') {
            throw new Error('verify only supports ECDSA');
        }
        const hashName =
            typeof algorithm.hash === 'string'
                ? algorithm.hash
                : algorithm.hash?.name;
        if (hashName !== 'SHA-256') {
            throw new Error('verify only supports SHA-256');
        }
        assertUsage('verify', key.usages);

        const sigBytes = u8FromInput(signature);
        const message = u8FromInput(data);
        try {
            return p256.verify(sigBytes, message, key._material, {
                prehash: true,
                lowS: true,
                format: 'der',
            });
        } catch {
            return false;
        }
    },

    async digest(
        algorithm: any,
        data: ArrayBuffer | ArrayBufferView
    ): Promise<ArrayBuffer> {
        const name = typeof algorithm === 'string' ? algorithm : algorithm?.name;
        if (name !== 'SHA-256') {
            throw new Error('digest only supports SHA-256');
        }
        const input = u8FromInput(data);
        const hash = sha256(input);
        return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
    },

    // Not used by Phantom; stubbed so the object looks like a SubtleCrypto.
    async deriveBits(): Promise<ArrayBuffer> {
        throw new Error('deriveBits is not supported');
    },
    async deriveKey(): Promise<CryptoKey> {
        throw new Error('deriveKey is not supported');
    },
    async wrapKey(): Promise<ArrayBuffer> {
        throw new Error('wrapKey is not supported');
    },
    async unwrapKey(): Promise<CryptoKey> {
        throw new Error('unwrapKey is not supported');
    },
    async encrypt(): Promise<ArrayBuffer> {
        throw new Error('encrypt is not supported');
    },
    async decrypt(): Promise<ArrayBuffer> {
        throw new Error('decrypt is not supported');
    },
} as unknown as SubtleCrypto;

function installSubtleCrypto() {
    if (typeof globalThis.crypto !== 'object' || globalThis.crypto == null) {
        (globalThis as any).crypto = {};
    }
    const crypto = globalThis.crypto as any;

    // react-native-get-random-values should already have installed this, but
    // guard against a missing implementation so we never lose randomness.
    if (typeof crypto.getRandomValues !== 'function') {
        crypto.getRandomValues = (buf: Uint8Array) => {
            throw new Error(
                'crypto.getRandomValues is not available; ensure react-native-get-random-values is imported first'
            );
        };
    }

    if (typeof crypto.subtle !== 'object' || crypto.subtle == null) {
        crypto.subtle = subtle;
    }
}

installSubtleCrypto();
