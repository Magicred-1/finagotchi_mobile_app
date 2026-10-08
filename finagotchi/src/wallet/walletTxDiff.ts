/**
 * Pure helpers to compare a wallet-returned transaction against the crafted
 * deposit we handed it. Lives outside useWallet.ts (a hook module with heavy
 * RN/Dynamic imports) so vitest can exercise the logic directly.
 *
 * Context: some wallets rewrite transactions during signing. Solana Mobile's
 * Seeker wallet appends a Lighthouse assertion instruction
 * (https://github.com/Jac0xb/lighthouse, program L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95)
 * to protect the user against simulation spoofing. That rewrite invalidates
 * the signature over OUR message, but the appended instruction is benign —
 * Jupiter validates deposits semantically (account-order-agnostic,
 * probe-verified) and the assertion simply executes on-chain.
 */

import { Buffer } from 'buffer';
import {
    Message,
    PublicKey,
    type Transaction,
    type VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';

/** Lighthouse assertion program (same id on mainnet-beta and devnet). */
export const LIGHTHOUSE_PROGRAM_ID =
    'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95';

/**
 * ComputeBudget program. Fee-config instructions carry no accounts and move
 * no funds, and wallets that re-simulate (Seeker) routinely re-price them —
 * they are excluded from the rewrite comparison entirely.
 */
const COMPUTE_BUDGET_PROGRAM_ID =
    'ComputeBudget111111111111111111111111111111';

export interface AddedAccountInfo {
    key: string;
    signer: boolean;
    writable: boolean;
    /** Programs whose instructions reference this account. */
    usedBy: string[];
}

export interface WalletTxDiff {
    added: string[];
    addedDetails: AddedAccountInfo[];
    removed: string[];
    craftedPrograms: string[];
    walletPrograms: string[];
}

/**
 * Compares a wallet's returned transaction against the crafted deposit:
 * accounts the wallet added or removed, and the program ids of both. Order
 * differences are ignored on purpose — Jupiter accepts any account order
 * (probe-verified); only set changes break validation.
 */
export function diffWalletTx(
    crafted: VersionedTransaction,
    signed: Transaction | VersionedTransaction
): WalletTxDiff {
    const craftedKeys = crafted.message.staticAccountKeys.map((k) =>
        k.toBase58()
    );
    const rawMessage =
        'version' in signed ? signed.message : signed.compileMessage();
    const message: {
        accountKeys: PublicKey[];
        compiledInstructions: {
            programIdIndex: number;
            accountKeyIndexes: number[];
        }[];
    } =
        'version' in signed
            ? {
                  accountKeys: signed.message.staticAccountKeys,
                  compiledInstructions: signed.message.compiledInstructions,
              }
            : signed.compileMessage();
    const signedKeys = message.accountKeys.map((k) => k.toBase58());
    const craftedSet = new Set(craftedKeys);
    const signedSet = new Set(signedKeys);
    const programIds = (m: {
        accountKeys: PublicKey[];
        compiledInstructions: { programIdIndex: number }[];
    }) =>
        m.compiledInstructions.map(
            (ci) => m.accountKeys[ci.programIdIndex]?.toBase58() ?? '?'
        );
    const added = signedKeys.filter((k) => !craftedSet.has(k));
    const numSigners = rawMessage.header.numRequiredSignatures;
    const addedDetails: AddedAccountInfo[] = added.map((key) => {
        const index = signedKeys.indexOf(key);
        const usedBy = [
            ...new Set(
                message.compiledInstructions
                    .filter((ci) => ci.accountKeyIndexes.includes(index))
                    .map(
                        (ci) =>
                            message.accountKeys[ci.programIdIndex]?.toBase58() ??
                            '?'
                    )
            ),
        ];
        return {
            key,
            signer: index >= 0 && index < numSigners,
            writable: index >= 0 ? rawMessage.isAccountWritable(index) : false,
            usedBy,
        };
    });
    return {
        added,
        addedDetails,
        removed: craftedKeys.filter((k) => !signedSet.has(k)),
        craftedPrograms: programIds({
            accountKeys: crafted.message.staticAccountKeys,
            compiledInstructions: crafted.message.compiledInstructions,
        }),
        walletPrograms: programIds(message),
    };
}

interface NormalizedInstruction {
    programId: string;
    accounts: string[];
    dataB64: string;
}

interface NormalizedMessage {
    keys: string[];
    numSigners: number;
    instructions: NormalizedInstruction[];
}

function normalizeCompiled(
    accountKeys: PublicKey[],
    numSigners: number,
    compiledInstructions: {
        programIdIndex: number;
        accountKeyIndexes: number[];
        data: Uint8Array;
    }[]
): NormalizedMessage {
    const keys = accountKeys.map((k) => k.toBase58());
    return {
        keys,
        numSigners,
        instructions: compiledInstructions.map((ci) => ({
            programId: keys[ci.programIdIndex] ?? '?',
            accounts: ci.accountKeyIndexes.map((i) => keys[i] ?? '?'),
            dataB64: Buffer.from(ci.data).toString('base64'),
        })),
    };
}

function normalizeLegacyMessage(message: Message): NormalizedMessage {
    const keys = message.accountKeys.map((k) => k.toBase58());
    return {
        keys,
        numSigners: message.header.numRequiredSignatures,
        instructions: message.instructions.map((ix) => ({
            programId: keys[ix.programIdIndex] ?? '?',
            accounts: ix.accounts.map((i) => keys[i] ?? '?'),
            dataB64: Buffer.from(bs58.decode(ix.data)).toString('base64'),
        })),
    };
}

function normalizeSignedTx(
    signed: Transaction | VersionedTransaction
): NormalizedMessage | null {
    if ('version' in signed) {
        // A LUT-based v0 reply can't be fully resolved without fetching the
        // tables — treat it as an unverifiable rewrite.
        if (signed.message.addressTableLookups.length > 0) return null;
        return normalizeCompiled(
            signed.message.staticAccountKeys,
            signed.message.header.numRequiredSignatures,
            signed.message.compiledInstructions
        );
    }
    return normalizeLegacyMessage(signed.compileMessage());
}

function sameInstruction(
    a: NormalizedInstruction,
    b: NormalizedInstruction
): boolean {
    return (
        a.programId === b.programId &&
        a.dataB64 === b.dataB64 &&
        a.accounts.length === b.accounts.length &&
        a.accounts.every((account, i) => account === b.accounts[i])
    );
}

/**
 * Null when the wallet's rewrite is benign: our crafted instructions survive
 * untouched and in order (ComputeBudget fee config excluded — wallets
 * re-price it on re-simulation), plus appended Lighthouse assertion
 * instructions whose extra accounts are PDAs (never signers). Otherwise a
 * human-readable reason for logging. Callers keep failing closed on any
 * non-null verdict.
 *
 * `craftedMessage` is the legacy message actually presented to the wallet
 * (LUTs inlined, crafted account order), not the original v0 craft.
 */
export function lighthouseRewriteVerdict(
    craftedMessage: Message,
    signed: Transaction | VersionedTransaction
): string | null {
    const wallet = normalizeSignedTx(signed);
    if (!wallet) return 'wallet reply is v0 with lookup tables — unverifiable';
    const crafted = normalizeLegacyMessage(craftedMessage);
    const craftedKeySet = new Set(crafted.keys);

    const assertions = wallet.instructions.filter(
        (ix) => ix.programId === LIGHTHOUSE_PROGRAM_ID
    );
    if (assertions.length === 0) return 'no Lighthouse instruction present';

    const rest = wallet.instructions.filter(
        (ix) =>
            ix.programId !== LIGHTHOUSE_PROGRAM_ID &&
            ix.programId !== COMPUTE_BUDGET_PROGRAM_ID
    );
    const craftedRest = crafted.instructions.filter(
        (ix) => ix.programId !== COMPUTE_BUDGET_PROGRAM_ID
    );

    // Every crafted instruction must survive, untouched and in order.
    if (rest.length !== craftedRest.length) {
        return `instruction count differs after filtering (crafted ${craftedRest.length}, wallet ${rest.length})`;
    }
    for (let i = 0; i < rest.length; i++) {
        if (!sameInstruction(rest[i], craftedRest[i])) {
            return `instruction #${i} (${craftedRest[i].programId}) was modified`;
        }
    }

    // Accounts the wallet added may only serve the assertions and must never
    // be signers (a new signer would silently change who funds/authorizes).
    for (const [index, key] of wallet.keys.entries()) {
        if (craftedKeySet.has(key)) continue;
        if (key === LIGHTHOUSE_PROGRAM_ID) continue;
        if (key === COMPUTE_BUDGET_PROGRAM_ID) continue;
        if (index < wallet.numSigners) {
            return `wallet added signer ${key}`;
        }
        const usedElsewhere = rest.some(
            (ix) => ix.accounts.includes(key) || ix.programId === key
        );
        if (usedElsewhere) return `wallet-added account ${key} used outside assertions`;
    }
    return null;
}

/** Boolean form of {@link lighthouseRewriteVerdict}. */
export function isLighthouseOnlyRewrite(
    craftedMessage: Message,
    signed: Transaction | VersionedTransaction
): boolean {
    return lighthouseRewriteVerdict(craftedMessage, signed) === null;
}
