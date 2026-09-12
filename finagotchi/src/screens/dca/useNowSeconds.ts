import { useEffect, useState } from 'react';

/**
 * Ticking clock in unix seconds so countdown labels ("next buy in 4h 12m")
 * stay live instead of freezing at the value from the last render.
 */
export function useNowSeconds(intervalMs = 1000): number {
    const [nowSec, setNowSec] = useState(() => Date.now() / 1000);

    useEffect(() => {
        const interval = setInterval(() => {
            setNowSec(Date.now() / 1000);
        }, intervalMs);
        return () => clearInterval(interval);
    }, [intervalMs]);

    return nowSec;
}
