/**
 * On-chain DCA client — Jupiter's classic DCA program (DCA265Vj…, mainnet)
 * via @jup-ag/dca-sdk.
 *
 * Unlike the Trigger v2 API there is no server-crafted transaction: the SDK
 * builds the transaction client-side, the wallet signs it, and we send it
 * ourselves. Wallet-appended Lighthouse assertions are harmless here — extra
 * instructions simply execute on-chain. The keeper fills rounds on schedule
 * (verified live: the program is invoked every ~30 minutes on mainnet).
 *
 * No JWT, no challenge auth: reads are plain RPC, writes are user-signed.
 */

import { DCA, Network } from '@jup-ag/dca-sdk';
import { Connection, PublicKey, type Transaction } from '@solana/web3.js';

import { preflightFunding } from './JupiterDcaClient';
import { SUPPORTED_TOKENS, tokenByMint, USDC_DECIMALS, USDC_MINT } from './types';
import type { DcaPlan } from './types';

const MAINNET_RPC =
    process.env.EXPO_PUBLIC_JUPITER_RPC ?? 'https://api.mainnet-beta.solana.com';

/**
 * Signs AND sends a transaction through the active wallet connection —
 * the same callback the mint/revive flows use.
 */
export type SignAndSendTransactionFn = (
    transaction: Transaction
) => Promise<string>;

let connection: Connection | null = null;
let dcaClient: DCA | null = null;

function getConnection(): Connection {
    return (connection ??= new Connection(MAINNET_RPC));
}

function getDca(): DCA {
    return (dcaClient ??= new DCA(getConnection(), Network.MAINNET));
}

/** Integer-exact USDC base units (6 decimals). */
function usdcBaseUnits(amountUsdc: number): bigint {
    return BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS));
}

export interface CreatePlanOrderInput {
    /** Output token mint (must be in SUPPORTED_TOKENS). */
    outputMint: string;
    /** USDC per round. */
    amountPerTick: number;
    /** Seconds between rounds. */
    intervalSec: number;
    /** Total USDC budget deposited into the DCA account. */
    totalBudget: number;
}

export interface CreatedPlanOrder {
    /** On-chain DCA account address — store as the plan's dcaAccountPubkey. */
    orderId: string;
    txSignature: string;
}

/** Normalized view of a DCA plan, same shape the FillWatcher already consumes. */
export interface PlanOrderSnapshot {
    /** 'active' while the on-chain account exists; terminal states are synthesized by the caller. */
    state: string;
    roundsFilled: number;
    numberOfRounds: number;
    /** USDC spent across filled rounds. */
    inputAmountUsed: number;
    /** USDC initially deposited. */
    inputAmountInitial: number;
    /** Output received across filled rounds, in output-token base units. */
    outputAmountTotal: number;
    /** USDC swapped per round. */
    amountPerRound: number;
    /** Unix seconds of the next scheduled round; null when none. */
    nextFillAt: number | null;
    /** Unix seconds of the most recent fill; null when none. */
    lastFillAt: number | null;
}

/**
 * Create a DCA plan: build the open-account transaction client-side, wallet
 * signs it (one signature, no login message), we send it. The on-chain
 * account address is the plan id.
 */
export async function createPlanOrder({
    walletPubkey,
    signAndSendTransaction,
    input,
}: {
    walletPubkey: string;
    signAndSendTransaction: SignAndSendTransactionFn;
    input: CreatePlanOrderInput;
}): Promise<CreatedPlanOrder> {
    if (!tokenByMint(input.outputMint)) {
        throw new Error(
            `dca: outputMint ${input.outputMint} is not in SUPPORTED_TOKENS ` +
                `(${SUPPORTED_TOKENS.map((t) => t.ticker).join(', ')})`
        );
    }
    if (!Number.isFinite(input.amountPerTick) || input.amountPerTick <= 0) {
        throw new Error(`dca: amountPerTick must be positive, got ${input.amountPerTick}`);
    }
    if (!Number.isFinite(input.totalBudget) || input.totalBudget <= 0) {
        throw new Error(`dca: totalBudget must be positive, got ${input.totalBudget}`);
    }
    if (Math.floor(input.totalBudget / input.amountPerTick) < 2) {
        throw new Error(
            `dca: totalBudget ${input.totalBudget} USD covers fewer than 2 rounds ` +
                `of ${input.amountPerTick} USD — increase the budget or lower the per-round amount`
        );
    }
    if (input.intervalSec < 30) {
        throw new Error(`dca: intervalSec must be at least 30, got ${input.intervalSec}`);
    }

    await preflightFunding(walletPubkey, input.totalBudget);

    const user = new PublicKey(walletPubkey);
    const { tx, dcaPubKey } = await getDca().createDcaV2({
        payer: user,
        user,
        inAmount: usdcBaseUnits(input.totalBudget),
        inAmountPerCycle: usdcBaseUnits(input.amountPerTick),
        cycleSecondsApart: BigInt(input.intervalSec),
        inputMint: new PublicKey(USDC_MINT),
        outputMint: new PublicKey(input.outputMint),
        minOutAmountPerCycle: null,
        maxOutAmountPerCycle: null,
        startAt: null,
    });

    const { blockhash } = await getConnection().getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = user;

    const txSignature = await signAndSendTransaction(tx);
    return { orderId: dcaPubKey.toBase58(), txSignature };
}

/**
 * Close a DCA plan (the "Pause" path): returns the unspent remainder (and any
 * unclaimed output) to the user's wallet, then deletes the on-chain account.
 * One-way — to resume, create a new plan.
 */
export async function cancelPlanOrder({
    walletPubkey,
    orderId,
    signAndSendTransaction,
}: {
    walletPubkey: string;
    orderId: string;
    signAndSendTransaction: SignAndSendTransactionFn;
}): Promise<{ txSignature: string }> {
    const user = new PublicKey(walletPubkey);
    const { tx } = await getDca().closeDCA({
        user,
        dca: new PublicKey(orderId),
    });

    const { blockhash } = await getConnection().getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = user;

    const txSignature = await signAndSendTransaction(tx);
    return { txSignature };
}

/**
 * Fetch the on-chain DCA account and normalize it. When the account is gone
 * (plan closed or fully spent), synthesizes the terminal state from the
 * plan's local totals: fully spent → 'completed', otherwise 'cancelled'.
 * Returns null for a brand-new plan whose account is not yet visible (RPC
 * lag right after creation), letting the watcher back off instead.
 */
export async function fetchPlanOrder({
    orderId,
    plan,
}: {
    orderId: string;
    plan?: DcaPlan;
}): Promise<PlanOrderSnapshot | null> {
    let account;
    try {
        account = await getDca().fetchDCA(new PublicKey(orderId));
    } catch {
        account = null;
    }

    if (!account) {
        if (!plan) return null;
        // Legacy Trigger-v2 plans have UUID order ids, not on-chain
        // addresses — never synthesize a terminal state for those.
        try {
            new PublicKey(orderId);
        } catch {
            return null;
        }
        const isBrandNew =
            plan.buys === 0 &&
            Date.now() - new Date(plan.createdAt).getTime() < 10 * 60 * 1000;
        if (isBrandNew) return null;
        const completed = plan.spent >= plan.totalBudget * 0.99;
        return {
            state: completed ? 'completed' : 'cancelled',
            roundsFilled: plan.buys,
            numberOfRounds: Math.floor(plan.totalBudget / plan.amountPerTick),
            inputAmountUsed: plan.spent,
            inputAmountInitial: plan.totalBudget,
            outputAmountTotal: 0,
            amountPerRound: plan.amountPerTick,
            nextFillAt: null,
            lastFillAt: null,
        };
    }

    const bn = (value: unknown): number => Number(value ?? 0);
    const inDeposited = bn(account.inDeposited);
    const inUsed = bn(account.inUsed);
    const inAmountPerCycle = bn(account.inAmountPerCycle);
    const usdc = (baseUnits: number) => baseUnits / 10 ** USDC_DECIMALS;

    return {
        state: 'active',
        roundsFilled:
            inAmountPerCycle > 0
                ? Math.floor(inUsed / inAmountPerCycle)
                : 0,
        numberOfRounds:
            inAmountPerCycle > 0
                ? Math.floor(inDeposited / inAmountPerCycle)
                : 0,
        inputAmountUsed: usdc(inUsed),
        inputAmountInitial: usdc(inDeposited),
        outputAmountTotal: bn(account.outReceived ?? account.outWithdrawn),
        amountPerRound: usdc(inAmountPerCycle),
        nextFillAt: bn(account.nextCycleAt) || null,
        lastFillAt: null,
    };
}
