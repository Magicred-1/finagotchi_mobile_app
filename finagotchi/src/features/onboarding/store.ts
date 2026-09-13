import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type OnboardingState = {
  hasCompletedOnboarding: boolean;
  /**
   * ISO timestamp of when the user consented to wallet sign-in for server
   * sync (quests/XP). Null = not consented; the quest client refuses to
   * trigger a wallet signature until this is set.
   */
  serverAuthConsentAt: string | null;
  completeOnboarding: () => void;
  grantServerAuthConsent: () => void;
  revokeServerAuthConsent: () => void;
  resetOnboarding: () => void;
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      serverAuthConsentAt: null,
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      grantServerAuthConsent: () =>
        set({ serverAuthConsentAt: new Date().toISOString() }),
      revokeServerAuthConsent: () => set({ serverAuthConsentAt: null }),
      resetOnboarding: () =>
        set({ hasCompletedOnboarding: false, serverAuthConsentAt: null }),
    }),
    {
      name: 'finagotchi-onboarding',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);