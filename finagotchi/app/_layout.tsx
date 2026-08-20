import 'react-native-get-random-values';

declare const process: { env: Record<string, string | undefined> };

import { Platform } from 'react-native';

if (Platform.OS === 'ios') {
    try {
        const webcrypto = require('isomorphic-webcrypto');
        if (typeof globalThis.crypto === 'undefined') {
            (globalThis as any).crypto = webcrypto;
        } else if (!globalThis.crypto.subtle) {
            (globalThis as any).crypto.subtle = webcrypto.subtle;
        }
    } catch (e) {
        console.warn('Failed to polyfill Web Crypto:', e);
    }
}

import React, { useEffect, useMemo } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  PhantomProvider,
  AddressType,
} from '@phantom/react-native-sdk';
import * as SplashScreen from 'expo-splash-screen';

import OnboardingFlow from '../src/features/onboarding/OnboardingFlow';
import { useOnboardingStore } from '../src/features/onboarding/store';
import { useWalletStore } from '../src/features/wallet/store';
import { usePetStore } from '../src/features/pet/store';
import { useWallet } from '../src/wallet/useWallet';

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

// Register your app at https://dashboard.phantom.app to get a real App ID.
const PHANTOM_APP_ID =
  process.env.EXPO_PUBLIC_PHANTOM_APP_ID ?? 'YOUR_PHANTOM_APP_ID';

export default function RootLayout() {
  return (
    <PhantomProvider
      config={{
        appId: PHANTOM_APP_ID,
        scheme: 'finagotchi',
        addressTypes: [AddressType.solana],
        providers: ['google', 'apple'],
        authOptions: {
          redirectUrl: 'finagotchi://phantom-auth-callback',
        },
      }}
    >
      <AppContent />
    </PhantomProvider>
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

  // Keep the wallet hook mounted so it syncs Phantom SDK state to our store.
  useWallet();

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
    </Stack>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {content}
    </GestureHandlerRootView>
  );
}
