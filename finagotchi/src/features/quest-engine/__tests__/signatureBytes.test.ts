import { describe, expect, it } from 'vitest';
import { Buffer } from 'buffer';
import bs58 from 'bs58';

import { normalizeSignatureBytes } from '../signatureBytes';

const RAW = Uint8Array.from({ length: 64 }, (_, i) => (i * 7 + 13) % 256);

describe('normalizeSignatureBytes', () => {
    it('passes through a 64-byte Uint8Array', () => {
        expect(normalizeSignatureBytes(RAW, 'Test')).toEqual(RAW);
    });

    it('converts a plain number array (JSON bridge round-trip)', () => {
        const asArray = Array.from(RAW);
        expect(normalizeSignatureBytes(asArray, 'Test')).toEqual(RAW);
    });

    it('converts an object with numeric keys', () => {
        const asObject: Record<string, number> = {};
        RAW.forEach((byte, i) => {
            asObject[String(i)] = byte;
        });
        expect(normalizeSignatureBytes(asObject, 'Test')).toEqual(RAW);
    });

    it('decodes bs58, base64 and hex strings', () => {
        expect(normalizeSignatureBytes(bs58.encode(RAW), 'Test')).toEqual(RAW);
        expect(
            normalizeSignatureBytes(Buffer.from(RAW).toString('base64'), 'Test')
        ).toEqual(RAW);
        expect(
            normalizeSignatureBytes(Buffer.from(RAW).toString('hex'), 'Test')
        ).toEqual(RAW);
    });

    it('reassembles a char-spread base64 string (native bridge round-trip)', () => {
        // The native embedded-webview bridge spreads the base64 signature
        // string into {'0': 'F', '1': 'q', …} — 88 keys for 64 bytes.
        const base64 = Buffer.from(RAW).toString('base64');
        const spread: Record<string, string> = {};
        for (let i = 0; i < base64.length; i++) {
            spread[String(i)] = base64[i];
        }
        expect(normalizeSignatureBytes(spread, 'Test')).toEqual(RAW);
    });

    it('reassembles char-code spreads of encoded strings', () => {
        // Same bridge artifact, but as char CODES: {'0': 70, '1': 113, …}.
        for (const encoded of [
            Buffer.from(RAW).toString('base64'),
            bs58.encode(RAW),
        ]) {
            const spread: Record<string, number> = {};
            for (let i = 0; i < encoded.length; i++) {
                spread[String(i)] = encoded.charCodeAt(i);
            }
            expect(normalizeSignatureBytes(spread, 'Test')).toEqual(RAW);
        }
    });

    it('rejects wrong lengths and odd shapes with a useful message', () => {
        expect(() => normalizeSignatureBytes(new Uint8Array(32), 'Dynamic')).toThrow(
            /Dynamic did not return an ed25519 signature/
        );
        expect(() => normalizeSignatureBytes('not-a-signature', 'Dynamic')).toThrow(
            /unexpected|did not return/
        );
        expect(() => normalizeSignatureBytes(null, 'Dynamic')).toThrow(/null/);
        expect(() => normalizeSignatureBytes({ a: 1 }, 'Dynamic')).toThrow(/1 keys/);
    });
});
