import '../src/polyfills';

import React, { useEffect, useMemo } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';

import { dynamicClient } from '../src/wallet/dynamicClient';
import { newDynamicClient } from '../src/wallet/newDynamicClient';
import { DynamicProvider } from '@dynamic-labs-sdk/react-hooks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import OnboardingFlow from '../src/features/onboarding/OnboardingFlow';
import { useOnboardingStore } from '../src/features/onboarding/store';
import { useWalletStore } from '../src/features/wallet/store';
import { usePetStore } from '../src/features/pet/store';
import { useWallet } from '../src/wallet/useWallet';
import { SheetPortalHost } from '../src/components/SheetPortal';
import { useFillWatcher } from '../src/services/dca';
import { useQuestEngine } from '../src/features/quest-engine/useQuestEngine';
import { useCreatureSync } from '../src/features/pet/creatureSync';
import { useUpdateCheck } from '../src/hooks/useUpdateCheck';

import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
  Poppins_900Black,
  useFonts,
} from '@expo-google-fonts/poppins';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <DynamicProvider client={newDynamicClient}>
          <AppContent />
        </DynamicProvider>
      </QueryClientProvider>
      {/* Dynamic's SDK requires its WebView mounted at the root, even for
          headless flows — auth silently fails without it. Rendered LAST so
          its prompt UI (zIndex 10000 while visible) draws above screens and
          portal sheets; hidden it is opacity 0 + zIndex -10000 and never
          intercepts touches. */}
      <dynamicClient.reactNative.WebView />
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
    Poppins_900Black,
  });

  const hasCompletedOnboarding = useOnboardingStore(
    (state) => state.hasCompletedOnboarding
  );
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding
  );

  const walletAddress = useWalletStore((state) => state.address);
  const mintAddress = usePetStore((state) => state.mintAddress);

  // Keep the wallet hook mounted so it syncs wallet state to our store.
  useWallet();

  // Verified quest engine: wallet auth signer, daily quest sync, claim flush.
  useQuestEngine();

  // Restore/heal the creature registry against the server on wallet connect,
  // so a returning user never has to mint again after a reinstall.
  useCreatureSync();

  // Poll on-chain DCA accounts for fills; a fill feeds the existing pet loop.
  useFillWatcher();

  // EAS Update prompt for TestFlight builds.
  useUpdateCheck();

  // Wallet connection and creature mint are mandatory. If any required state
  // is missing, force the user back into onboarding at the appropriate step.
  const { isOnboardingComplete, initialStep } = useMemo(() => {
    const hasWallet = !!walletAddress;
    const hasMint = !!mintAddress;

    if (hasCompletedOnboarding && hasWallet && hasMint) {
      return { isOnboardingComplete: true, initialStep: 'splash' as const };
    }

    // Fresh install: always start with the branded splash.
    if (!hasCompletedOnboarding) {
      return { isOnboardingComplete: false, initialStep: 'splash' as const };
    }

    // Returning user with missing wallet or mint data: skip straight to the
    // step that fixes the missing requirement.
    if (!hasWallet) {
      return { isOnboardingComplete: false, initialStep: 'connect' as const };
    }

    if (!hasMint) {
      return { isOnboardingComplete: false, initialStep: 'name' as const };
    }

    return { isOnboardingComplete: false, initialStep: 'splash' as const };
  }, [hasCompletedOnboarding, walletAddress, mintAddress]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  const content = !isOnboardingComplete ? (
    <OnboardingFlow
      initialStep={initialStep}
      onFinished={completeOnboarding}
    />
  ) : (
    <Stack>
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen name="hardware/binding" options={{ headerShown: false }} />
      <Stack.Screen name="hardware/wifi" options={{ headerShown: false }} />
    </Stack>
  );

  return (
    <>
      {content}
      {/* Sheets render here (in-tree, above screens) instead of RN Modals so
          Dynamic's WebView — mounted last, at the root — can still draw its
          signature/export prompts above them when it becomes visible. */}
      <SheetPortalHost />
    </>
  );
}
