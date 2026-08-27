import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { colors } from '../../theme/tokens';

export type QuestCategory = 'Wallet' | 'Bank' | 'Habits' | 'Social' | 'Sponsored';
export type QuestSource = 'wallet' | 'bank' | 'habit' | 'social' | 'sponsored';

export const QUEST_ACCENTS: Record<QuestCategory, string> = {
    Habits: colors.primary,
    Wallet: colors.cyan,
    Bank: colors.warning,
    Social: colors.danger,
    Sponsored: colors.purple,
};

export type QuestRequirement = {
  metric: 'transactions' | 'balance' | 'accounts' | 'streak';
  target: number;
};

export type Quest = {
  id: string;
  category: QuestCategory;
  source: QuestSource;
  icon: string;
  title: string;
  description: string;
  reward: number;
  rewardXp: number;
  accent: string;
  requirement?: QuestRequirement;
};

export const QUESTS: Quest[] = [
  {
    id: 'save-streak',
    category: 'Habits',
    source: 'habit',
    icon: 'leaf-outline',
    title: 'Daily savings streak',
    description: 'Keep your daily savings streak alive.',
    reward: 25,
    rewardXp: 15,
    accent: QUEST_ACCENTS.Habits,
  },
  {
    id: 'wallet-activity',
    category: 'Wallet',
    source: 'wallet',
    icon: 'wallet-outline',
    title: 'On-chain activity',
    description: 'Make one wallet transaction today.',
    reward: 75,
    rewardXp: 40,
    accent: QUEST_ACCENTS.Wallet,
    requirement: { metric: 'transactions', target: 1 },
  },
  {
    id: 'bank-linked',
    category: 'Bank',
    source: 'bank',
    icon: 'card-outline',
    title: 'Link a bank account',
    description: 'Connect a bank to track saving goals.',
    reward: 150,
    rewardXp: 80,
    accent: QUEST_ACCENTS.Bank,
    requirement: { metric: 'accounts', target: 1 },
  },
  {
    id: 'share',
    category: 'Social',
    source: 'social',
    icon: 'share-outline',
    title: 'Share your Finny',
    description: 'Show your companion to a friend.',
    reward: 40,
    rewardXp: 20,
    accent: QUEST_ACCENTS.Social,
  },
  {
    id: 'sponsored-tip',
    category: 'Sponsored',
    source: 'sponsored',
    icon: 'flash-outline',
    title: 'Learn a money tip',
    description: 'Watch a 15-second partner tip and earn a reward.',
    reward: 60,
    rewardXp: 30,
    accent: QUEST_ACCENTS.Sponsored,
  },
  {
    id: 'sponsored-invite',
    category: 'Sponsored',
    source: 'sponsored',
    icon: 'people-outline',
    title: 'Invite a caretaker',
    description: 'Bring a friend to keep your Finny safer together.',
    reward: 100,
    rewardXp: 50,
    accent: QUEST_ACCENTS.Sponsored,
  },
];

function dateKey(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  return dateKey(0);
}

type QuestState = {
  completedToday: Record<string, boolean>;
  lastResetAt: string | null;

  /** Reset progress if the date rolled over. Called automatically by other getters. */
  resetIfNeeded: () => void;
  /** Mark a quest completed today. */
  completeQuest: (id: string) => void;
  /** Whether a quest is already claimed today. */
  isCompletedToday: (id: string) => boolean;
  /** Progress summary for the current day. */
  getProgress: () => { completed: number; total: number };
  /** Exposed for testing/debugging. */
  forceReset: () => void;
};

export const useQuestStore = create<QuestState>()(
  persist(
    (set, get) => ({
      completedToday: {},
      lastResetAt: null,

      resetIfNeeded: () => {
        const today = todayKey();
        if (get().lastResetAt !== today) {
          set({ completedToday: {}, lastResetAt: today });
        }
      },

      completeQuest: (id) => {
        get().resetIfNeeded();
        if (get().completedToday[id]) return;
        set({
          completedToday: { ...get().completedToday, [id]: true },
        });
      },

      isCompletedToday: (id) => {
        get().resetIfNeeded();
        return !!get().completedToday[id];
      },

      getProgress: () => {
        get().resetIfNeeded();
        const completed = Object.values(get().completedToday).filter(Boolean).length;
        return { completed, total: QUESTS.length };
      },

      forceReset: () => {
        set({ completedToday: {}, lastResetAt: null });
      },
    }),
    {
      name: 'finagotchi-quests',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
