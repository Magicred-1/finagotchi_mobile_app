/**
 * Wallet-signed challenge–response auth, shared by app and server.
 *
 * The client signs the UTF-8 BYTES of the string returned here with its
 * Solana ed25519 key (Mobile Wallet Adapter `signMessages`), and sends
 * `x-wallet-auth: <wallet>:<nonce>:<signature-base58>`. The server rebuilds
 * the same string from (wallet, nonce, expiresAt) and verifies against the
 * wallet's ed25519 public key.
 */
export function buildAuthMessage(wallet: string, nonce: string, expiresAtMs: number): string {
  return `finagotchi-auth:v1:${wallet}:${nonce}:${expiresAtMs}`;
}
