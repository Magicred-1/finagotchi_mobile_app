/**
 * Finagotchi hardware contract — payload builders and validators.
 *
 * FROZEN: implements docs/HARDWARE_CONTRACT.md byte-for-byte. The firmware is
 * built to that document; do not change formats here without changing the
 * firmware. Pure TypeScript, no React Native imports — also used by tests.
 */

/** MTU the app requests on Android (iOS negotiates automatically). */
export const PROTOCOL_MTU = 128;
/** ATT payload before MTU negotiation (23 - 3 header bytes). */
export const DEFAULT_ATT_PAYLOAD = 20;
/** Spacing between replayed dca:hit writes (device toast queue is 3 deep). */
export const TOAST_SPACING_MS = 800;

export const TICKER_MAX_LEN = 6;
const TICKER_RE = /^[A-Z0-9]{1,6}$/;
const UINT32_MAX = 0xffffffff;

export type PetStageName = 'egg' | 'coinling' | 'hodler' | 'whale';

export interface PetSnapshot {
    stage: PetStageName;
    streak: number;
    /** 0-5 */
    mood: number;
    /** 0-6 */
    item: number;
    points: number;
    /** 0-100 */
    happy: number;
    /** 1-12 evolution sub-stage shown on the hardware screen. */
    subStage?: number;
}

export interface DcaPlanSnapshot {
    ticker: string;
    /** USDC per tick, plain float. */
    amount: number;
    /** Unix seconds (uint32) of the next scheduled buy. */
    nextBuyEpoch: number;
    /** Fills executed so far. */
    buys: number;
    /** Output tokens held, plain float. */
    holdings: number;
    enabled: boolean;
}

function utf8Length(value: string): number {
    // Payloads are ASCII by contract; fall back to a real count anyway.
    let length = 0;
    for (let i = 0; i < value.length; i++) {
        const code = value.codePointAt(i) ?? 0;
        length += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
        if (code > 0xffff) i++;
    }
    return length;
}

function assertUint(name: string, value: number, max = UINT32_MAX): void {
    if (!Number.isInteger(value) || value < 0 || value > max) {
        throw new Error(`contract: ${name} must be a uint32, got ${value}`);
    }
}

export function assertTicker(ticker: string): void {
    if (!TICKER_RE.test(ticker)) {
        throw new Error(
            `contract: ticker must be 1-${TICKER_MAX_LEN} uppercase A-Z0-9 chars, got "${ticker}"`
        );
    }
}

export function assertEpoch(epoch: number): void {
    assertUint('epoch', epoch);
}

/**
 * Render a plain float: no exponent, no trailing zeros. The contract forbids
 * scientific notation, so values too small or too large to render plainly are
 * rejected rather than sent.
 */
export function formatAmount(value: number): string {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`contract: amount must be a non-negative finite float, got ${value}`);
    }
    if (value > 0 && (value < 1e-6 || value >= 1e12)) {
        throw new Error(`contract: amount ${value} cannot be rendered as a plain float`);
    }
    const rendered = value.toFixed(6).replace(/\.?0+$/, '');
    return rendered === '' ? '0' : rendered;
}

/** Full pet snapshot: "<stage>:<streak>:<mood>:<item>:<points>:<happy>[:<subStage>]". */
export function buildSnapshot(snapshot: PetSnapshot): string {
    assertUint('streak', snapshot.streak);
    assertUint('mood', snapshot.mood, 5);
    assertUint('item', snapshot.item, 6);
    assertUint('points', snapshot.points);
    assertUint('happy', snapshot.happy, 100);
    const base = `${snapshot.stage}:${snapshot.streak}:${snapshot.mood}:${snapshot.item}:${snapshot.points}:${snapshot.happy}`;
    if (snapshot.subStage === undefined) return base;
    assertUint('subStage', snapshot.subStage, 12);
    return `${base}:${snapshot.subStage}`;
}

/**
 * Snapshot write sequence. If the full snapshot fits the negotiated payload
 * it is a single write; otherwise it is split so points:/happy: are written
 * separately and never truncate (contract §3.1).
 */
export function buildSnapshotWrites(
    snapshot: PetSnapshot,
    payloadBytes: number
): string[] {
    const full = buildSnapshot(snapshot);
    if (utf8Length(full) <= payloadBytes) return [full];
    return [
        `${snapshot.stage}:${snapshot.streak}:${snapshot.mood}:${snapshot.item}`,
        `points:${snapshot.points}`,
        `happy:${snapshot.happy}`,
        `substage:${snapshot.subStage ?? 1}`,
    ];
}

/** Clock sync: "epoch:<sec>" (uint32 unix seconds — hardware has no RTC). */
export function buildEpoch(epochSec: number): string {
    assertEpoch(epochSec);
    return `epoch:${epochSec}`;
}

export function buildDcaCount(count: number): string {
    assertUint('count', count, 0xff);
    return `dca:count:${count}`;
}

/**
 * "dca:plan:<i>:<enabled>:<next_buy_epoch>:<amount>:<TICKER>:<buys>:<holdings>"
 */
export function buildDcaPlan(index: number, plan: DcaPlanSnapshot): string {
    assertUint('index', index, 0xff);
    assertEpoch(plan.nextBuyEpoch);
    assertTicker(plan.ticker);
    assertUint('buys', plan.buys);
    const amount = formatAmount(plan.amount);
    const holdings = formatAmount(plan.holdings);
    return `dca:plan:${index}:${plan.enabled ? 1 : 0}:${plan.nextBuyEpoch}:${amount}:${plan.ticker}:${plan.buys}:${holdings}`;
}

/** Fill toast: "dca:hit:<n>:<TICKER>" where n = total buys after the fill. */
export function buildDcaHit(buys: number, ticker: string): string {
    assertUint('buys', buys);
    assertTicker(ticker);
    return `dca:hit:${buys}:${ticker}`;
}

/** The full dca:count + dca:plan rewrite sequence for a plan list. */
export function buildPlanPush(plans: DcaPlanSnapshot[]): string[] {
    return [
        buildDcaCount(plans.length),
        ...plans.map((plan, index) => buildDcaPlan(index, plan)),
    ];
}

/**
 * djb2 hash over the rendered push lines. Compared against the last
 * acknowledged hash in app storage; identical hash = skip the push.
 */
export function planPushHash(lines: string[]): string {
    let hash = 5381;
    const joined = lines.join('\n');
    for (let i = 0; i < joined.length; i++) {
        hash = ((hash << 5) + hash + joined.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
}

/** Parse a "dca:plan:<i>:<enabled>:<epoch>:<amount>:<TICKER>:<buys>:<holdings>" line. */
export function parseDcaPlanLine(line: string): { index: number; plan: DcaPlanSnapshot } | null {
    const parts = line.trim().split(':');
    if (parts.length !== 9 || parts[0] !== 'dca' || parts[1] !== 'plan') return null;
    const [, , index, enabled, nextEpoch, amount, ticker, buys, holdings] = parts;
    return {
        index: Number(index),
        plan: {
            enabled: enabled === '1',
            nextBuyEpoch: Number(nextEpoch),
            amount: Number(amount),
            ticker,
            buys: Number(buys),
            holdings: Number(holdings),
        },
    };
}

/** Parse a "dca:hit:<n>:<TICKER>" line. */
export function parseDcaHitLine(line: string): { buys: number; ticker: string } | null {
    const parts = line.trim().split(':');
    if (parts.length !== 4 || parts[0] !== 'dca' || parts[1] !== 'hit') return null;
    return { buys: Number(parts[2]), ticker: parts[3] };
}
