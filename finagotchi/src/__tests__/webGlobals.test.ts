import { describe, expect, it } from 'vitest';

import {
    CustomEventShim,
    EventShim,
    EventTargetShim,
    installWebGlobals,
} from '../webGlobals';

/**
 * Smoke test for the RN web-global shims in a bare Node environment. The
 * failure mode being guarded against (from device logs):
 *   wallet-standard:register-wallet event listener could not be added —
 *   TypeError: window.addEventListener is not a function
 *   wallet-standard:app-ready event could not be dispatched —
 *   TypeError: Cannot assign to property 'type' which has only a getter
 * Both come from @wallet-standard/app's getWallets(), which
 * @dynamic-labs-sdk/solana calls at extension-registration time.
 */
describe('webGlobals shims', () => {
    it('EventShim supports wallet-standard-style subclass with getter-only type', () => {
        // Replicates @wallet-standard/app's AppReadyEvent exactly: it extends
        // Event and re-declares `type` as a getter-only accessor on the
        // prototype, so a base constructor doing `this.type = type` throws.
        class AppReadyEvent extends EventShim {
            detail: unknown;
            constructor(api: unknown) {
                super('wallet-standard:app-ready', {
                    bubbles: false,
                    cancelable: false,
                    composed: false,
                });
                this.detail = api;
            }
        }
        Object.defineProperty(AppReadyEvent.prototype, 'type', {
            get() {
                return 'wallet-standard:app-ready';
            },
        });

        const api = { register: () => {} };
        let event: AppReadyEvent | undefined;
        expect(() => {
            event = new AppReadyEvent(api);
        }).not.toThrow();
        expect(event!.type).toBe('wallet-standard:app-ready');
        expect(event!.detail).toBe(api);
        expect(event!.bubbles).toBe(false);
    });

    it('EventTargetShim round-trips a wallet-standard register-wallet listener', () => {
        const target = new EventTargetShim();
        const api = { register: () => {} };
        const received: unknown[] = [];

        // Mirrors @wallet-standard/app getWallets():
        // window.addEventListener('wallet-standard:register-wallet',
        //   ({ detail: callback }) => callback(api))
        target.addEventListener('wallet-standard:register-wallet', (event) => {
            const { detail: callback } = event as {
                detail: (cb: (a: unknown) => void) => void;
            };
            callback((a) => received.push(a));
        });

        const event = new CustomEventShim('wallet-standard:register-wallet', {
            detail: (callback: (a: unknown) => void) => callback(api),
        });
        expect(target.dispatchEvent(event)).toBe(true);

        const plainEvent = new EventShim('wallet-standard:app-ready');
        expect(() => target.dispatchEvent(plainEvent)).not.toThrow();
        expect(received).toEqual([api]);
    });

    it('removeEventListener detaches the listener', () => {
        const target = new EventTargetShim();
        const received: string[] = [];
        const listener = (event: unknown) =>
            received.push((event as { type: string }).type);

        target.addEventListener('x', listener);
        target.removeEventListener('x', listener);
        target.dispatchEvent(new EventShim('x'));
        expect(received).toEqual([]);
    });

    it('installWebGlobals fills gaps without clobbering existing globals', () => {
        const preExistingEvent = globalThis.Event; // Node provides a native Event
        const preExistingEventTarget = globalThis.EventTarget;

        installWebGlobals();

        // Working globals are preserved untouched.
        expect(globalThis.Event).toBe(preExistingEvent);
        expect(globalThis.EventTarget).toBe(preExistingEventTarget);

        const win = (globalThis as Record<string, unknown>).window as Record<
            string,
            unknown
        >;
        expect(win).toBeDefined();
        expect(typeof win.addEventListener).toBe('function');
        expect(typeof win.removeEventListener).toBe('function');
        expect(typeof win.dispatchEvent).toBe('function');

        // wallet-standard-style registration/dispatch round-trips through window.
        // The event is built with whatever global Event constructor is active
        // (native here, EventShim on RN) — that's what wallet-standard does.
        const received: string[] = [];
        (win.addEventListener as EventTarget['addEventListener'])(
            'wallet-standard:register-wallet',
            (event) => received.push((event as Event).type)
        );
        const EventCtor = globalThis.Event as new (type: string) => { type: string };
        (
            win.dispatchEvent as (event: { type: string }) => boolean
        )(new EventCtor('wallet-standard:register-wallet'));
        expect(received).toEqual(['wallet-standard:register-wallet']);

        // Idempotent: a second install keeps the same handlers.
        const addEventListener = win.addEventListener;
        installWebGlobals();
        expect(win.addEventListener).toBe(addEventListener);
    });
});
