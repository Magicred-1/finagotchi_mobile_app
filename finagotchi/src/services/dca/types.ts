/**
 * DCA plan model and supported tokenized-stock whitelist.
 *
 * Whitelist mints are Backed xStocks on Solana mainnet (8 decimals),
 * verified against the Jupiter token API. Tickers are contract-safe
 * (≤6 uppercase chars, see services/ble/protocol).
 */

export type DcaPlanStatus = 'active' | 'paused' | 'complete' | 'failed';

export interface DcaPlan {
    id: string;
    /** Output token mint (base58). */
    outputMint: string;
    /** ≤6 uppercase chars, e.g. "SPYX". */
    ticker: string;
    /** USDC per cycle. */
    amountPerTick: number;
    /** Cycle length in seconds. */
    intervalSec: number;
    /** Total USDC budget deposited into the on-chain DCA account. */
    totalBudget: number;
    /** USDC spent so far (sum of executed cycles). */
    spent: number;
    /** Fills executed so far. */
    buys: number;
    /** Output tokens accumulated so far. */
    holdingsHeld: number;
    /** Unix seconds of the next expected keeper execution; null when done. */
    nextExecutionAt: number | null;
    status: DcaPlanStatus;
    /** Jupiter Trigger DCA order id (UUID); null until the create call lands. */
    dcaAccountPubkey: string | null;
    /** Consecutive missed polls/executions driving the overdue state. */
    missedCount: number;
    createdAt: string;
}

export interface SupportedToken {
    ticker: string;
    name: string;
    mint: string;
    decimals: number;
}

/** USDC (input token for all plans). Mainnet mint; 6 decimals. */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DECIMALS = 6;

/**
 * Supported tokenized stocks (Backed xStocks). This is the ONLY set the
 * wizard may offer — arbitrary mints are not accepted.
 */
export const SUPPORTED_TOKENS: SupportedToken[] = [
    { ticker: 'SPYX', name: 'SPDR S&P 500 ETF', mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', decimals: 8 },
    { ticker: 'QQQX', name: 'Invesco QQQ ETF', mint: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ', decimals: 8 },
    { ticker: 'TSLAX', name: 'Tesla', mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', decimals: 8 },
    { ticker: 'NVDAX', name: 'NVIDIA', mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', decimals: 8 },
    { ticker: 'AAPLX', name: 'Apple', mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', decimals: 8 },
    { ticker: 'COINX', name: 'Coinbase', mint: 'Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu', decimals: 8 },
    { ticker: 'MSTRX', name: 'MicroStrategy', mint: 'XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ', decimals: 8 },
];

export const CADENCE_OPTIONS = [
    { id: 'daily', label: 'Daily', intervalSec: 86_400 },
    { id: 'weekly', label: 'Weekly', intervalSec: 604_800 },
    { id: 'biweekly', label: 'Every 2 weeks', intervalSec: 1_209_600 },
    { id: 'monthly', label: 'Monthly', intervalSec: 2_592_000 },
] as const;

export type CadenceId = (typeof CADENCE_OPTIONS)[number]['id'];

export function tokenByMint(mint: string): SupportedToken | null {
    return SUPPORTED_TOKENS.find((token) => token.mint === mint) ?? null;
}

export function tokenByTicker(ticker: string): SupportedToken | null {
    return SUPPORTED_TOKENS.find((token) => token.ticker === ticker) ?? null;
}
