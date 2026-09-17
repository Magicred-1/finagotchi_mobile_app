// Avoid Keypair.generate() because @solana/web3.js depends on
// globalThis.crypto.getRandomValues, which is not always available in RN.
export function generateDemoMintAddress(): string {
    // A valid Solana public key is 32 bytes. Generate random bytes with the
    // standard crypto polyfill and encode them as base58. This keeps the mint
    // flow from crashing while the real on-chain Metaplex mint is not yet wired.
    const bytes = new Uint8Array(32);
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { default: bs58 } = require('bs58');
    return bs58.encode(bytes);
}
