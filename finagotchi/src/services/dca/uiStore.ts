import { create } from 'zustand';

export type DcaReaction = 'dance';

/** Optional wizard prefill from a device `dca:new:<TICKER>:<amountSol>:<freqSec>` request. */
export type DcaWizardPrefill = {
    ticker: string;
    amountSol: number;
    freqSec: number;
};

/**
 * Recreate (resume) request for a paused plan, from a device `dca:pause:<i>`
 * on a paused slot: the wizard opens in recreate mode (same shape as
 * DCADetail's edit flow) so resume is one review + wallet signature.
 */
export type DcaWizardRecreate = {
    ticker: string;
    pauseId: string;
};

type DcaUiState = {
    /** Reaction the home screen should play once, set by DCA flows. */
    pendingReaction: DcaReaction | null;
    requestReaction: (reaction: DcaReaction) => void;
    /** Reads and clears the pending reaction (home screen consumes on focus). */
    consumeReaction: () => DcaReaction | null;
    /** Set when the device asks the app to open the DCA wizard. */
    wizardOpenRequested: boolean;
    /** Prefill carried with the open request (`dca:new`); null otherwise. */
    wizardPrefill: DcaWizardPrefill | null;
    /** Recreate target (`dca:pause` on a paused plan); null otherwise. */
    wizardRecreate: DcaWizardRecreate | null;
    requestWizardOpen: (request?: {
        prefill?: DcaWizardPrefill;
        recreate?: DcaWizardRecreate;
    }) => void;
    /** Reads and clears the wizard-open request (DCAHome consumes it). */
    consumeWizardOpen: () => {
        prefill: DcaWizardPrefill | null;
        recreate: DcaWizardRecreate | null;
    } | null;
    /** Set when the device asks to open a plan's detail (`dca:pause` on an active plan). */
    detailOpenRequested: boolean;
    detailPlanId: string | null;
    requestDetailOpen: (planId: string) => void;
    /** Reads and clears the detail-open request (DCAHome consumes it). */
    consumeDetailOpen: () => { planId: string } | null;
};

export const useDcaUiStore = create<DcaUiState>()((set, get) => ({
    pendingReaction: null,

    requestReaction: (reaction) => {
        set({ pendingReaction: reaction });
    },

    consumeReaction: () => {
        const reaction = get().pendingReaction;
        if (reaction !== null) {
            set({ pendingReaction: null });
        }
        return reaction;
    },

    wizardOpenRequested: false,
    wizardPrefill: null,
    wizardRecreate: null,

    requestWizardOpen: (request) => {
        set({
            wizardOpenRequested: true,
            wizardPrefill: request?.prefill ?? null,
            wizardRecreate: request?.recreate ?? null,
        });
    },

    consumeWizardOpen: () => {
        if (!get().wizardOpenRequested) return null;
        const prefill = get().wizardPrefill;
        const recreate = get().wizardRecreate;
        set({
            wizardOpenRequested: false,
            wizardPrefill: null,
            wizardRecreate: null,
        });
        return { prefill, recreate };
    },

    detailOpenRequested: false,
    detailPlanId: null,

    requestDetailOpen: (planId) => {
        set({ detailOpenRequested: true, detailPlanId: planId });
    },

    consumeDetailOpen: () => {
        if (!get().detailOpenRequested) return null;
        const planId = get().detailPlanId;
        set({ detailOpenRequested: false, detailPlanId: null });
        return planId ? { planId } : null;
    },
}));
