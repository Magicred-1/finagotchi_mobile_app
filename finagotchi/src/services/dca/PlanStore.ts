import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { DcaPlan, DcaPlanStatus } from './types';

export interface RecordFillInput {
    /** Cumulative USDC spent on-chain after the fill. */
    spentTotal: number;
    /** Cumulative output tokens received on-chain after the fill. */
    holdingsTotal: number;
    /** Unix seconds of the next keeper cycle; null when the plan is done. */
    nextExecutionAt: number | null;
}

export interface DcaFillRecord {
    planId: string;
    /** ISO timestamp of when the fill was observed. */
    at: string;
    /** Output tokens gained by this fill (holdingsTotal − previous holdingsHeld). */
    holdingsDelta: number;
    /** Total buys on the plan after this fill. */
    buysAfter: number;
}

type PlanState = {
    plans: DcaPlan[];
    /** Fill history across all plans, oldest first. */
    fills: DcaFillRecord[];

    addPlan: (plan: DcaPlan) => void;
    updatePlan: (id: string, patch: Partial<DcaPlan>) => void;
    removePlan: (id: string) => void;
    /** Record one executed cycle: totals are absolute (from chain), buys increments. */
    recordFill: (id: string, fill: RecordFillInput) => void;
    setStatus: (id: string, status: DcaPlanStatus) => void;
    setMissed: (id: string, missedCount: number) => void;
    getActivePlans: () => DcaPlan[];
};

export const usePlanStore = create<PlanState>()(
    persist(
        (set, get) => ({
            plans: [],
            fills: [],

            addPlan: (plan) => {
                set({ plans: [...get().plans, plan] });
            },

            updatePlan: (id, patch) => {
                set({
                    plans: get().plans.map((plan) =>
                        plan.id === id ? { ...plan, ...patch } : plan
                    ),
                });
            },

            removePlan: (id) => {
                set({ plans: get().plans.filter((plan) => plan.id !== id) });
            },

            recordFill: (id, fill) => {
                const plan = get().plans.find((p) => p.id === id);
                if (!plan) return;
                const record: DcaFillRecord = {
                    planId: id,
                    at: new Date().toISOString(),
                    holdingsDelta: fill.holdingsTotal - plan.holdingsHeld,
                    buysAfter: plan.buys + 1,
                };
                set({
                    fills: [...get().fills, record],
                    plans: get().plans.map((p) =>
                        p.id === id
                            ? {
                                  ...p,
                                  spent: fill.spentTotal,
                                  holdingsHeld: fill.holdingsTotal,
                                  nextExecutionAt: fill.nextExecutionAt,
                                  buys: p.buys + 1,
                              }
                            : p
                    ),
                });
            },

            setStatus: (id, status) => {
                get().updatePlan(id, { status });
            },

            setMissed: (id, missedCount) => {
                get().updatePlan(id, { missedCount });
            },

            getActivePlans: () => {
                return get().plans.filter((plan) => plan.status === 'active');
            },
        }),
        {
            name: 'finagotchi-dca-plans',
            storage: createJSONStorage(() => AsyncStorage),
            version: 1,
            migrate: (persisted) => {
                const state = persisted as Partial<PlanState> | undefined;
                return {
                    ...state,
                    plans: state?.plans ?? [],
                    fills: state?.fills ?? [],
                } as PlanState;
            },
        }
    )
);
