import { create } from 'zustand';

export type DcaReaction = 'dance';

type DcaUiState = {
    /** Reaction the home screen should play once, set by DCA flows. */
    pendingReaction: DcaReaction | null;
    requestReaction: (reaction: DcaReaction) => void;
    /** Reads and clears the pending reaction (home screen consumes on focus). */
    consumeReaction: () => DcaReaction | null;
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
}));
