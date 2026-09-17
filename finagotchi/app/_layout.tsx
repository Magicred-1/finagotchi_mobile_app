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
      {/* Dynamic's SDK requires its WebView mounted at the root, even for
          headless flows — auth silently fails without it. */}
      <dynamicClient.reactNative.WebView />
      <AppContent />
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

  // Poll on-chain DCA accounts for fills; a fill feeds the existing pet loop.
  useFillWatcher();

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
      <Stack.Screen
        name="dca/[id]"
        options={{
          headerShown: false,
          // Rendered as a bottom sheet over the home screen; BottomSheet
          // drives the motion, so the stack itself stays transparent/still.
          presentation: 'transparentModal',
          animation: 'none',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="hardware/binding" options={{ headerShown: false }} />
    </Stack>
  );

  return (
    <>
      {content}
      {/* Sheets render here (in-tree, above screens) instead of RN Modals so
          Dynamic's native overlay — signature prompts, key export — always
          draws above them. */}
      <SheetPortalHost />
    </>
  );
}
