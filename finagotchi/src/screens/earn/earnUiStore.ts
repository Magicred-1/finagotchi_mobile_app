import { create } from 'zustand';

/** Earn programs a quest card can redirect to (the home pager's pages). */
export type EarnProgram = 'swap' | 'dca';

type EarnUiState = {
    /**
     * Queued quest redirect — EarnHome consumes it to slide the pager onto
     * the program's page. Distinct from `swapOpenRequested`: the page slide
     * and the sheet open are consumed by different components.
     */
    programRequested: EarnProgram | null;
    /** Queued swap-sheet open — SwapHome consumes it. */
    swapOpenRequested: boolean;
    requestProgram: (program: EarnProgram) => void;
    /** Reads and clears the pager target (EarnHome consumes it). */
    consumeProgram: () => EarnProgram | null;
    /** Reads and clears the swap-open request (SwapHome consumes it). */
    consumeSwapOpen: () => boolean;
};

/**
 * Quest → earn-program redirect channel. QuestsSheet queues a target when an
 * unfinished on-chain quest is tapped; the earn surfaces consume their slice
 * (pager slide in EarnHome, sheet open in SwapHome, wizard via useDcaUiStore).
 */
export const useEarnUiStore = create<EarnUiState>()((set, get) => ({
    programRequested: null,
    swapOpenRequested: false,

    requestProgram: (program) => {
        set({
            programRequested: program,
            swapOpenRequested: program === 'swap',
        });
    },

    consumeProgram: () => {
        const program = get().programRequested;
        if (program !== null) set({ programRequested: null });
        return program;
    },

    consumeSwapOpen: () => {
        const requested = get().swapOpenRequested;
        if (requested) set({ swapOpenRequested: false });
        return requested;
    },
}));
