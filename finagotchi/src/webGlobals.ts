/**
 * Minimal web-global shims (window / Event / EventTarget / CustomEvent) for
 * React Native.
 *
 * Why this exists: @dynamic-labs-sdk/solana's wallet-standard extension calls
 * getWallets() from @wallet-standard/app at registration time. That code is
 * browser-oriented: RN defines `window` (an alias of the global object), so
 * its `typeof window === 'undefined'` guard passes, but `window` has no
 * addEventListener/dispatchEvent, and RN ships no global `Event`. Both calls
 * fail loudly at boot ("window.addEventListener is not a function" and, with a
 * naive Event class, "Cannot assign to property 'type' which has only a
 * getter" — wallet-standard's AppReadyEvent subclasses Event and re-declares
 * `type` as a getter-only accessor, so a base constructor that assigns
 * `this.type` throws).
 *
 * On RN there are no browser-injected wallets, so wallet-standard registration
 * is a no-op by design; these shims make that no-op silent instead of fatal.
 * Existing globals are NEVER clobbered — if the runtime (or another compat
 * layer such as @walletconnect/react-native-compat) already provides a working
 * Event/EventTarget/window piece, it is left alone and only gaps are filled.
 *
 * This module is pure (no React Native imports) so it can be unit-tested in a
 * bare Node environment. It is invoked from src/polyfills.ts, which must stay
 * the first import of the app entry.
 */

export type ShimEventListener = (event: unknown) => void;

export class EventShim {
    // `type` is declared via interface merging below (a `declare` class
    // field is rejected by Metro's Babel); the constructor defines the
    // property directly on the instance instead of assigning it.
    bubbles: boolean;
    cancelable: boolean;
    composed: boolean;
    defaultPrevented: boolean;
    cancelBubble: boolean;
    timeStamp: number;
    target: unknown;
    currentTarget: unknown;
    srcElement: unknown;

    constructor(
        type: string,
        options: { bubbles?: boolean; cancelable?: boolean; composed?: boolean } = {}
    ) {
        // defineProperty, NOT `this.type = type`: subclasses like
        // wallet-standard's AppReadyEvent declare a getter-only `type` on
        // their prototype, and assignment would hit that missing setter and
        // throw. defineProperty creates an own data property regardless.
        Object.defineProperty(this, 'type', {
            value: String(type),
            writable: true,
            enumerable: true,
            configurable: true,
        });
        this.bubbles = Boolean(options.bubbles);
        this.cancelable = Boolean(options.cancelable);
        this.composed = Boolean(options.composed);
        this.defaultPrevented = false;
        this.cancelBubble = false;
        this.timeStamp = Date.now();
        this.target = null;
        this.currentTarget = null;
        this.srcElement = null;
    }

    preventDefault(): void {
        if (this.cancelable) this.defaultPrevented = true;
    }

    stopPropagation(): void {
        this.cancelBubble = true;
    }

    stopImmediatePropagation(): void {
        this.cancelBubble = true;
    }
}

export class CustomEventShim extends EventShim {
    constructor(
        type: string,
        options: { bubbles?: boolean; cancelable?: boolean; composed?: boolean; detail?: unknown } = {}
    ) {
        super(type, options);
        Object.defineProperty(this, 'detail', {
            value: options.detail ?? null,
            writable: true,
            enumerable: true,
            configurable: true,
        });
    }
}

// Property types for fields the constructors define via Object.defineProperty
// (interface merging emits nothing, so Metro's Babel strips it cleanly).
export interface EventShim {
    type: string;
}
export interface CustomEventShim {
    detail: unknown;
}

export class EventTargetShim {
    private listeners = new Map<string, Set<ShimEventListener>>();

    addEventListener(type: string, listener: ShimEventListener | null): void {
        if (typeof listener !== 'function') return;
        const key = String(type);
        let set = this.listeners.get(key);
        if (!set) {
            set = new Set();
            this.listeners.set(key, set);
        }
        set.add(listener);
    }

    removeEventListener(type: string, listener: ShimEventListener | null): void {
        if (typeof listener !== 'function') return;
        this.listeners.get(String(type))?.delete(listener);
    }

    dispatchEvent(event: { type?: unknown }): boolean {
        if (!event || typeof event.type !== 'string') {
            throw new TypeError('EventTarget.dispatchEvent: event must have a string type');
        }
        const set = this.listeners.get(event.type);
        if (set) {
            // Copy: listeners may remove themselves while dispatching.
            for (const listener of [...set]) {
                listener(event);
            }
        }
        return !(event as { defaultPrevented?: boolean }).defaultPrevented;
    }
}

const EVENT_TARGET_METHODS = ['addEventListener', 'removeEventListener', 'dispatchEvent'] as const;

/**
 * Fills gaps in the RN global object so browser-oriented wallet SDK code runs
 * harmlessly. Idempotent and non-destructive: any global that already exists
 * is preserved untouched.
 */
export function installWebGlobals(): void {
    const g = globalThis as Record<string, unknown>;

    if (typeof g.Event !== 'function') {
        g.Event = EventShim;
    }
    if (typeof g.EventTarget !== 'function') {
        g.EventTarget = EventTargetShim;
    }
    if (typeof g.CustomEvent !== 'function') {
        g.CustomEvent = CustomEventShim;
    }

    // RN convention: `window` aliases the global object. Only create it when
    // truly absent (e.g. plain Node), never replace an existing one.
    if (typeof g.window !== 'object' || g.window === null) {
        g.window = g;
    }

    const win = g.window as Record<string, unknown>;
    if (EVENT_TARGET_METHODS.some((method) => typeof win[method] !== 'function')) {
        const TargetCtor = g.EventTarget as new () => EventTargetShim;
        const target = new TargetCtor();
        for (const method of EVENT_TARGET_METHODS) {
            if (typeof win[method] !== 'function') {
                Object.defineProperty(win, method, {
                    value: target[method].bind(target),
                    writable: true,
                    configurable: true,
                });
            }
        }
    }
}
