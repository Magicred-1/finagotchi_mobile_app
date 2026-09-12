import { CADENCE_OPTIONS } from '../../services/dca';

export function cadenceAbbrev(intervalSec: number): string {
    switch (intervalSec) {
        case 86_400:
            return 'd';
        case 604_800:
            return 'wk';
        case 1_209_600:
            return '2wk';
        case 2_592_000:
            return 'mo';
        default:
            return `${Math.round(intervalSec / 86_400)}d`;
    }
}

export function cadenceAdverb(intervalSec: number): string {
    const option = CADENCE_OPTIONS.find((c) => c.intervalSec === intervalSec);
    return option ? option.label.toLowerCase() : `every ${Math.round(intervalSec / 86_400)} days`;
}

/** 0.25 → "0.25", 10 → "10", 2.5 → "2.5". */
export function formatUsdc(amount: number): string {
    return String(Math.round(amount * 100) / 100);
}

/**
 * Backed's metadata host serves token logos under a lowercase-x ticker
 * ("SPYX" → "SPYx.png"); the all-caps variant 403s.
 */
export function tokenLogoUrl(ticker: string): string {
    return `https://xstocks-metadata.backed.fi/logos/tokens/${ticker.replace(/X$/, 'x')}.png`;
}

/** "2d", "4h", "12m", or "now" when due/past. */
export function timeUntilShort(nextExecutionAt: number | null, nowSec: number): string {
    if (nextExecutionAt === null) return '–';
    const delta = nextExecutionAt - nowSec;
    if (delta <= 0) return 'now';
    const days = Math.floor(delta / 86_400);
    if (days >= 1) return `${days}d`;
    const hours = Math.floor(delta / 3_600);
    if (hours >= 1) return `${hours}h`;
    return `${Math.max(1, Math.floor(delta / 60))}m`;
}

/** "2d 4h", "4h 12m", "1m", for the detail countdown. */
export function timeUntilLong(nextExecutionAt: number | null, nowSec: number): string {
    if (nextExecutionAt === null) return '–';
    const delta = Math.max(0, nextExecutionAt - nowSec);
    const days = Math.floor(delta / 86_400);
    const hours = Math.floor((delta % 86_400) / 3_600);
    const minutes = Math.floor((delta % 3_600) / 60);
    const seconds = delta % 60;
    if (days >= 1) return `${days}d ${hours}h`;
    if (hours >= 1) return `${hours}h ${minutes}m`;
    if (minutes >= 1) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

/** "5 days", "about 3 weeks", "about 2 months". */
export function humanDuration(totalSec: number): string {
    const days = Math.max(1, Math.round(totalSec / 86_400));
    if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
    const weeks = Math.round(days / 7);
    if (weeks <= 5) return `about ${weeks} week${weeks === 1 ? '' : 's'}`;
    const months = Math.max(1, Math.round(days / 30));
    return `about ${months} month${months === 1 ? '' : 's'}`;
}
