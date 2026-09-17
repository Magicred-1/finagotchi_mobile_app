import React, { useEffect, useState } from 'react';
import { WalletPickerSheet } from '../../components/WalletPickerSheet';
import { connectDynamicWallet } from '../../wallet/dynamicWalletPicker';
import type { WalletOption } from '../../wallet/dynamicWalletPicker';
import { Platform } from 'react-native';
import Animated, {
    ReduceMotion,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import SplashStep from './SplashStep';
import ConnectWalletStep from './ConnectWalletStep';
import AuthConsentStep from './AuthConsentStep';
import NameCreatureStep from './NameCreatureStep';
import MintStep from './MintStep';
import HatchStep from './HatchStep';
import ReminderStep from './ReminderStep';

import { useWallet } from '../../wallet/useWallet';
import { MIN_MINT_BALANCE_LAMPORTS } from '../../wallet/useWallet';
import { useWalletStore } from '../../features/wallet/store';
import { useOnboardingStore } from './store';
import { usePetStore } from '../../features/pet/store';
import { login } from '../quest-engine';
import { registerNftCreature } from '../nft/client';

type Step =
    | 'splash'
    | 'connect'
    | 'auth'
    | 'name'
    | 'mint'
    | 'hatch'
    | 'reminder';

type Props = {
    initialStep?: Step;
    onFinished: () => void;
};

const STEP_ORDER: Step[] = [
    'splash',
    'connect',
    'auth',
    'name',
    'mint',
    'hatch',
    'reminder',
];

const DURATION_OUT = 180;
const DURATION_IN = 280;
const SLIDE_DISTANCE = 40;

function stepIndex(step: Step): number {
    return STEP_ORDER.indexOf(step);
}

export default function OnboardingFlow({
    initialStep = 'splash',
    onFinished,
}: Props) {
    const [walletOptions, setWalletOptions] = useState<WalletOption[]>([]);
    const [walletPickerVisible, setWalletPickerVisible] = useState(false);
    const [step, setStep] = useState<Step>(initialStep);
    const [displayedStep, setDisplayedStep] = useState<Step>(initialStep);
    const [creatureName, setCreatureName] = useState('');
    const [fundingDismissed, setFundingDismissed] = useState(false);
    const [mintBalanceChecked, setMintBalanceChecked] = useState(false);

    const wallet = useWallet();
    const walletAddress = useWalletStore((state) => state.address);
    const serverAuthConsentAt = useOnboardingStore(
        (state) => state.serverAuthConsentAt
    );
    const grantServerAuthConsent = useOnboardingStore(
        (state) => state.grantServerAuthConsent
    );
    const mintCreature = usePetStore((state) => state.mintCreature);

    const opacity = useSharedValue(1);
    const translateX = useSharedValue(0);
    const direction = useSharedValue(1);

    // Direction-aware cross-fade: slide out toward the leaving direction,
    // then slide the new step in from the opposite side.
    useEffect(() => {
        if (step === displayedStep) return;

        const nextIndex = stepIndex(step);
        const currentIndex = stepIndex(displayedStep);
        direction.value = nextIndex > currentIndex ? 1 : -1;

        opacity.value = withTiming(
            0,
            { duration: DURATION_OUT, reduceMotion: ReduceMotion.System },
            (finished) => {
                if (finished) {
                    runOnJS(setDisplayedStep)(step);
                }
            }
        );
        translateX.value = withTiming(
            -SLIDE_DISTANCE * direction.value,
            { duration: DURATION_OUT, reduceMotion: ReduceMotion.System }
        );
    }, [step, displayedStep, opacity, translateX, direction]);

    useEffect(() => {
        opacity.value = withTiming(1, {
            duration: DURATION_IN,
            reduceMotion: ReduceMotion.System,
        });
        translateX.value = withTiming(0, {
            duration: DURATION_IN,
            reduceMotion: ReduceMotion.System,
        });
    }, [displayedStep, opacity, translateX]);

    // Re-offer funding if the user reconnects with a different wallet.
    useEffect(() => {
        setFundingDismissed(false);
    }, [walletAddress]);

    // Re-verify the embedded wallet's SOL balance when the mint step is
    // reached (right after naming), so the funding sheet reflects a fresh
    // balance rather than the connect-time snapshot.
    const refreshBalance = wallet.refreshBalance;
    const connectionType = wallet.connectionType;
    useEffect(() => {
        setMintBalanceChecked(false);
        if (step !== 'mint' || connectionType !== 'dynamic') return;

        let cancelled = false;
        refreshBalance().finally(() => {
            if (!cancelled) setMintBalanceChecked(true);
        });
        return () => {
            cancelled = true;
        };
    }, [step, walletAddress, connectionType, refreshBalance]);

    // Only embedded (Dynamic) wallets get the funding prompt; external MWA
    // wallet users manage their own SOL. Shown once the pre-mint balance
    // check above has settled and the wallet cannot cover the mint.
    const needsFunding =
        step === 'mint' &&
        mintBalanceChecked &&
        connectionType === 'dynamic' &&
        wallet.solBalance !== null &&
        wallet.solBalance < MIN_MINT_BALANCE_LAMPORTS;

    // Auto-advance from connect once the wallet authorizes. First-time users
    // pass through the server sign-in consent step; returning users (consent
    // already granted) skip straight to naming.
    useEffect(() => {
        if (wallet.connected && step === 'connect') {
            setStep(serverAuthConsentAt ? 'name' : 'auth');
        }
    }, [wallet.connected, step, serverAuthConsentAt]);

    // Guard against landing on a step we cannot complete.
    useEffect(() => {
        if ((step === 'auth' || step === 'name' || step === 'mint') && !walletAddress) {
            setStep('connect');
            return;
        }
        if (
            (step === 'mint' || step === 'hatch' || step === 'reminder') &&
            !creatureName
        ) {
            setStep('name');
            return;
        }
        if (
            (step === 'hatch' || step === 'reminder') &&
            !usePetStore.getState().mintAddress
        ) {
            setStep('mint');
        }
    }, [step, walletAddress, creatureName]);

    const handlePasskey = async () => {
        await wallet.connectWithPasskey();
    };

    const handleGoogle = async () => {
        await wallet.connectWithGoogle();
    };

    const handleApple = async () => {
        await wallet.connectWithApple();
    };
    const handleOwnWallet = async () => {
        const options = await wallet.connectWithOwnWallet();
        setWalletOptions(options);
        setWalletPickerVisible(true);
    };

    const handleSelectWallet = async (walletKey: string) => {
        try {
            await connectDynamicWallet(walletKey);
            setWalletPickerVisible(false);
        } catch (err) {
            console.error('Failed to connect wallet:', err);
        }
    };

    const handleRequestEmailOtp = async (email: string) => {
        return wallet.requestEmailOtp(email);
    };

    const handleVerifyEmailOtp = async (otp: string) => {
        await wallet.verifyEmailOtp(otp);
    };

    const handleMwa = async () => {
        await wallet.connectWithMwa();
    };

    const handleAuthConsent = async () => {
        if (!walletAddress) {
            throw new Error('Wallet not connected');
        }
        // Grant first: the quest client refuses to trigger a wallet
        // signature without consent on record.
        grantServerAuthConsent();
        await login(walletAddress);
        setStep('name');
    };

    const handleAuthSkip = () => {
        setStep('name');
    };

    const handleNameSubmit = (name: string) => {
        setCreatureName(name);
        setStep('mint');
    };

    const handleMint = async () => {
        if (!walletAddress) {
            throw new Error('Wallet not connected');
        }

        const { mintAddress, signature: mintTxSignature, priceLamports: mintPriceLamports } = await wallet.mintCreatureNft(creatureName);
        mintCreature(creatureName, mintAddress);

        // Register the creature in the server-side DB registry.
        // The server will later be replaced by on-chain minting + metadata.
        if (walletAddress) {
            registerNftCreature(walletAddress, mintAddress, creatureName, usePetStore.getState().stage, mintTxSignature, mintPriceLamports ?? 0).catch(() => {});
        }

        setStep('hatch');
    };

    const handleHatchFinished = () => {
        setStep('reminder');
    };

    const handleReminderFinished = () => {
        onFinished();
    };

    const contentStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateX: translateX.value }],
    }));

    const renderStep = (currentStep: Step) => {
        switch (currentStep) {
            case 'splash':
                return <SplashStep onFinished={() => setStep('connect')} />;
            case 'connect':
                return (
                    <ConnectWalletStep
                        platform={Platform.OS as 'ios' | 'android' | 'web'}
                        isSeeker={wallet.isSeeker}
                        onConnectPasskey={handlePasskey}
                        onConnectGoogle={handleGoogle}
                        onConnectApple={handleApple}
    onConnectOwnWallet={handleOwnWallet}
                        onRequestEmailOtp={handleRequestEmailOtp}
                        onVerifyEmailOtp={handleVerifyEmailOtp}
                        onConnectMwa={handleMwa}
                    />
                );
            case 'auth':
                return walletAddress ? (
                    <AuthConsentStep
                        walletAddress={walletAddress}
                        onConsent={handleAuthConsent}
                        onSkip={handleAuthSkip}
                    />
                ) : null;
            case 'name':
                return <NameCreatureStep onSubmit={handleNameSubmit} />;
            case 'mint':
                return walletAddress ? (
                    <MintStep
                        creatureName={creatureName}
                        walletAddress={walletAddress}
                        funding={{
                            visible: needsFunding && !fundingDismissed,
                            walletAddress,
                            balanceLamports: wallet.solBalance,
                            requiredLamports: MIN_MINT_BALANCE_LAMPORTS,
                            onRefreshBalance: wallet.refreshBalance,
                            onDismiss: () => setFundingDismissed(true),
                        }}
                        onMint={handleMint}
                    />
                ) : null;
            case 'hatch':
                return (
                    <HatchStep
                        creatureName={creatureName}
                        onFinished={handleHatchFinished}
                    />
                );
            case 'reminder':
                return <ReminderStep onFinished={handleReminderFinished} />;
            default:
                return null;
        }
    };

    return (
        <>
            <Animated.View style={[{ flex: 1 }, contentStyle]}>
                {renderStep(displayedStep)}
            </Animated.View>
            <WalletPickerSheet
                visible={walletPickerVisible}
                onClose={() => setWalletPickerVisible(false)}
                onSelect={(wallet) => handleSelectWallet(wallet.key)}
                options={walletOptions}
            />
        </>
    );
}
