import { create } from 'zustand';

export type DcaReaction = 'dance';

type DcaUiState = {
    /** Reaction the home screen should play once, set by DCA flows. */
    pendingReaction: DcaReaction | null;
    requestReaction: (reaction: DcaReaction) => void;
    /** Reads and clears the pending reaction (home screen consumes on focus). */
    consumeReaction: () => DcaReaction | null;
    /** Set when the device asks the app to open the DCA wizard (`dca:req`). */
    wizardOpenRequested: boolean;
    requestWizardOpen: () => void;
    /** Reads and clears the wizard-open request (DCAHome consumes it). */
    consumeWizardOpen: () => boolean;
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

    requestWizardOpen: () => {
        set({ wizardOpenRequested: true });
    },

    consumeWizardOpen: () => {
        const requested = get().wizardOpenRequested;
        if (requested) {
            set({ wizardOpenRequested: false });
        }
        return requested;
    },
}));
