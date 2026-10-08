import { describe, expect, it } from 'vitest';

import {
    Keypair,
    MessageV0,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    VersionedTransaction,
} from '@solana/web3.js';
import { Buffer } from 'buffer';

import {
    LIGHTHOUSE_PROGRAM_ID,
    diffWalletTx,
    isLighthouseOnlyRewrite,
    lighthouseRewriteVerdict,
} from '../walletTxDiff';

const LIGHTHOUSE = new PublicKey(LIGHTHOUSE_PROGRAM_ID);
const COMPUTE_BUDGET = new PublicKey(
    'ComputeBudget111111111111111111111111111111'
);
const BLOCKHASH = '4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM';

const payer = Keypair.generate().publicKey;
const receiver = Keypair.generate().publicKey;
const tokenProgramFake = Keypair.generate().publicKey;
const tokenAccount = Keypair.generate().publicKey;

function computeBudgetIx(unitPrice: number): TransactionInstruction {
    return new TransactionInstruction({
        programId: COMPUTE_BUDGET,
        keys: [],
        data: Buffer.from([3, ...new Array(8).fill(unitPrice)]),
    });
}

function craftedInstructions(): TransactionInstruction[] {
    return [
        computeBudgetIx(1),
        computeBudgetIx(1),
        SystemProgram.transfer({
            fromPubkey: payer,
            toPubkey: receiver,
            lamports: 1_000_000,
        }),
        new TransactionInstruction({
            programId: tokenProgramFake,
            keys: [
                { pubkey: tokenAccount, isSigner: false, isWritable: true },
                { pubkey: payer, isSigner: true, isWritable: false },
            ],
            data: Buffer.from([3, 1, 2, 3]),
        }),
    ];
}

/** The legacy message shape the app presents to the wallet (LUTs inlined). */
function buildCraftedMessage() {
    const tx = new Transaction({
        feePayer: payer,
        recentBlockhash: BLOCKHASH,
    }).add(...craftedInstructions());
    return tx.compileMessage();
}

function lighthouseAssertionIx(
    overrides?: Partial<{
        memoryAccount: PublicKey;
        signer: boolean;
        programId: PublicKey;
    }>
): TransactionInstruction {
    const memoryAccount = overrides?.memoryAccount ?? Keypair.generate().publicKey;
    return new TransactionInstruction({
        programId: overrides?.programId ?? LIGHTHOUSE,
        keys: [
            {
                pubkey: memoryAccount,
                isSigner: overrides?.signer ?? false,
                isWritable: true,
            },
        ],
        data: Buffer.from([9, 0, 0, 0]),
    });
}

/** What Seeker hands back: our instructions plus a Lighthouse assertion. */
function buildSeekerRewrittenTx(): Transaction {
    return new Transaction({
        feePayer: payer,
        recentBlockhash: BLOCKHASH,
    }).add(...craftedInstructions(), lighthouseAssertionIx());
}

describe('isLighthouseOnlyRewrite', () => {
    it('accepts a rewrite that only appends a Lighthouse assertion', () => {
        const crafted = buildCraftedMessage();
        const signed = buildSeekerRewrittenTx();
        expect(isLighthouseOnlyRewrite(crafted, signed)).toBe(true);
    });

    it('accepts the same rewrite returned as a v0 transaction without LUTs', () => {
        const crafted = buildCraftedMessage();
        const messageV0 = MessageV0.compile({
            payerKey: payer,
            instructions: [...craftedInstructions(), lighthouseAssertionIx()],
            recentBlockhash: BLOCKHASH,
        });
        const signed = new VersionedTransaction(messageV0);
        expect(isLighthouseOnlyRewrite(crafted, signed)).toBe(true);
    });

    it('rejects when nothing Lighthouse-related was added', () => {
        const crafted = buildCraftedMessage();
        const signed = new Transaction({
            feePayer: payer,
            recentBlockhash: BLOCKHASH,
        }).add(...craftedInstructions());
        expect(isLighthouseOnlyRewrite(crafted, signed)).toBe(false);
    });

    it('rejects when a foreign program is appended alongside Lighthouse', () => {
        const crafted = buildCraftedMessage();
        const rogue = new TransactionInstruction({
            programId: Keypair.generate().publicKey,
            keys: [{ pubkey: receiver, isSigner: false, isWritable: true }],
            data: Buffer.from([7]),
        });
        const signed = new Transaction({
            feePayer: payer,
            recentBlockhash: BLOCKHASH,
        }).add(...craftedInstructions(), lighthouseAssertionIx(), rogue);
        expect(isLighthouseOnlyRewrite(crafted, signed)).toBe(false);
    });

    it('tolerates re-priced ComputeBudget instructions (Seeker re-simulation)', () => {
        const crafted = buildCraftedMessage();
        const repriced = craftedInstructions().map((ix) =>
            ix.programId.equals(COMPUTE_BUDGET) ? computeBudgetIx(9) : ix
        );
        const signed = new Transaction({
            feePayer: payer,
            recentBlockhash: BLOCKHASH,
        }).add(
            ...repriced,
            lighthouseAssertionIx(),
            lighthouseAssertionIx(),
            lighthouseAssertionIx()
        );
        expect(isLighthouseOnlyRewrite(crafted, signed)).toBe(true);
    });

    it('rejects when a crafted non-budget instruction was tampered with', () => {
        const crafted = buildCraftedMessage();
        const tampered = craftedInstructions();
        tampered[2] = SystemProgram.transfer({
            fromPubkey: payer,
            toPubkey: receiver,
            lamports: 2_000_000, // doubled
        });
        const signed = new Transaction({
            feePayer: payer,
            recentBlockhash: BLOCKHASH,
        }).add(...tampered, lighthouseAssertionIx());
        const verdict = lighthouseRewriteVerdict(crafted, signed);
        expect(isLighthouseOnlyRewrite(crafted, signed)).toBe(false);
        expect(verdict).toContain('was modified');
    });

    it('rejects when the assertion drags in a new signer', () => {
        const crafted = buildCraftedMessage();
        const signed = new Transaction({
            feePayer: payer,
            recentBlockhash: BLOCKHASH,
        }).add(
            ...craftedInstructions(),
            lighthouseAssertionIx({ signer: true })
        );
        expect(isLighthouseOnlyRewrite(crafted, signed)).toBe(false);
    });

    it('rejects when a crafted instruction was dropped', () => {
        const crafted = buildCraftedMessage();
        const signed = new Transaction({
            feePayer: payer,
            recentBlockhash: BLOCKHASH,
        }).add(craftedInstructions()[2], lighthouseAssertionIx());
        const verdict = lighthouseRewriteVerdict(crafted, signed);
        expect(isLighthouseOnlyRewrite(crafted, signed)).toBe(false);
        expect(verdict).toContain('instruction count differs');
    });
});

describe('diffWalletTx', () => {
    it('reports the Lighthouse program and its PDA as added accounts', () => {
        const craftedMessage = buildCraftedMessage();
        const craftedV0 = new VersionedTransaction(
            MessageV0.compile({
                payerKey: payer,
                instructions: craftedInstructions(),
                recentBlockhash: BLOCKHASH,
            })
        );
        const signed = buildSeekerRewrittenTx();
        const diff = diffWalletTx(craftedV0, signed);
        expect(diff.added).toContain(LIGHTHOUSE_PROGRAM_ID);
        expect(diff.removed).toEqual([]);
        const lighthouseEntry = diff.addedDetails.find(
            (a) => a.key === LIGHTHOUSE_PROGRAM_ID
        );
        expect(lighthouseEntry?.signer).toBe(false);
        expect(craftedMessage.accountKeys.length).toBeGreaterThan(0);
    });
});
