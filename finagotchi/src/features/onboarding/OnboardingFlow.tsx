import React, { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import SplashStep from './SplashStep';
import ConnectWalletStep from './ConnectWalletStep';
import NameCreatureStep from './NameCreatureStep';
import MintStep from './MintStep';
import HatchStep from './HatchStep';
import FirstCheckinStep from './FirstCheckinStep';
import ReminderStep from './ReminderStep';

import { useWallet } from '../../wallet/useWallet';
import { useWalletStore } from '../../features/wallet/store';
import { usePetStore } from '../../features/pet/store';
import { useCheckinStore } from '../../features/checkin/store';
import { generateFakeMintAddress } from '../../wallet/useWallet';

type Step =
    | 'splash'
    | 'connect'
    | 'name'
    | 'mint'
    | 'hatch'
    | 'firstCheckin'
    | 'reminder';

type Props = {
    initialStep?: Step;
    onFinished: () => void;
};

export default function OnboardingFlow({
    initialStep = 'splash',
    onFinished,
}: Props) {
    const [step, setStep] = useState<Step>(initialStep);
    const [creatureName, setCreatureName] = useState('');

    const wallet = useWallet();
    const walletAddress = useWalletStore((state) => state.address);
    const mintCreature = usePetStore((state) => state.mintCreature);
    const checkIn = useCheckinStore((state) => state.checkIn);

    // Auto-advance from connect once the wallet authorizes.
    useEffect(() => {
        if (wallet.connected && step === 'connect') {
            setStep('name');
        }
    }, [wallet.connected, step]);

    // Guard against landing on a step we cannot complete.
    useEffect(() => {
        if ((step === 'name' || step === 'mint') && !walletAddress) {
            setStep('connect');
            return;
        }
        if (
            (step === 'mint' ||
                step === 'hatch' ||
                step === 'firstCheckin' ||
                step === 'reminder') &&
            !creatureName
        ) {
            setStep('name');
            return;
        }
        if (
            (step === 'hatch' ||
                step === 'firstCheckin' ||
                step === 'reminder') &&
            !usePetStore.getState().mintAddress
        ) {
            setStep('mint');
        }
    }, [step, walletAddress, creatureName]);

    const handleConnect = useCallback(async () => {
        await wallet.connect();
    }, [wallet]);

    const handleNameSubmit = useCallback((name: string) => {
        setCreatureName(name);
        setStep('mint');
    }, []);

    const handleMint = useCallback(async () => {
        if (!walletAddress) {
            throw new Error('Wallet not connected');
        }

        // Simulate network/blockchain delay for the MVP demo mint.
        await new Promise((resolve) => setTimeout(resolve, 2500));

        const fakeMintAddress = generateFakeMintAddress();
        mintCreature(creatureName, fakeMintAddress);

        setStep('hatch');
    }, [creatureName, mintCreature, walletAddress]);

    const handleHatchFinished = useCallback(() => {
        setStep('firstCheckin');
    }, []);

    const handleFirstCheckin = useCallback(
        (saved: boolean, details?: { amount?: number; category?: string }) => {
            checkIn(saved, details);
        },
        [checkIn]
    );

    const handleFirstCheckinFinished = useCallback(() => {
        setStep('reminder');
    }, []);

    const handleReminderFinished = useCallback(() => {
        onFinished();
    }, [onFinished]);

    switch (step) {
        case 'splash':
            return <SplashStep onFinished={() => setStep('connect')} />;
        case 'connect':
            return (
                <ConnectWalletStep
                    platform={Platform.OS as 'ios' | 'android' | 'web'}
                    onConnect={handleConnect}
                />
            );
        case 'name':
            return <NameCreatureStep onSubmit={handleNameSubmit} />;
        case 'mint':
            return walletAddress ? (
                <MintStep
                    creatureName={creatureName}
                    walletAddress={walletAddress}
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
        case 'firstCheckin':
            return (
                <FirstCheckinStep
                    creatureName={creatureName}
                    onCheckIn={handleFirstCheckin}
                    onFinished={handleFirstCheckinFinished}
                />
            );
        case 'reminder':
            return <ReminderStep onFinished={handleReminderFinished} />;
        default:
            return null;
    }
}
