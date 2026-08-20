import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import Animated, {
    ReduceMotion,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import {
    Stage1Egg,
    Stage2Coinling,
    Stage3Hodler,
    Stage5Whale,
} from './PetSprites';
import { STAGE_NAMES, type PetStage } from '../features/pet/store';
import { colors, spacing, springs, typography } from '../theme/tokens';

type Props = {
    visible: boolean;
    stage: PetStage;
    petName: string | null;
    onDismiss: () => void;
};

export default function EvolutionCeremony({
    visible,
    stage,
    petName,
    onDismiss,
}: Props) {
    const { width, height } = useWindowDimensions();
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0.8);
    const [isExiting, setIsExiting] = useState(false);

    const enter = useCallback(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        opacity.value = withTiming(1, { duration: 350 });
        scale.value = withSpring(1, {
            ...springs.momentum,
            reduceMotion: ReduceMotion.System,
        });
    }, [opacity, scale]);

    const exit = useCallback(() => {
        setIsExiting(true);
        opacity.value = withTiming(0, { duration: 220 });
        scale.value = withSpring(0.92, {
            ...springs.default,
            reduceMotion: ReduceMotion.System,
        });

        const timer = setTimeout(() => {
            setIsExiting(false);
            onDismiss();
        }, 250);
        return () => clearTimeout(timer);
    }, [onDismiss, opacity, scale]);

    useEffect(() => {
        if (visible && !isExiting) {
            opacity.value = 0;
            scale.value = 0.8;
            enter();
        }
    }, [visible, isExiting, enter, opacity, scale]);

    const containerStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    const contentStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const stageName = STAGE_NAMES[stage] ?? STAGE_NAMES[1];

    const shareableMessage = useMemo(() => {
        return `${petName || 'My Finagotchi'} evolved into ${
            stageName.split('•')[0].trim()
        }! 🔥 #Finagotchi`;
    }, [petName, stageName]);

    const renderPet = () => {
        switch (stage) {
            case 1:
                return <Stage1Egg size={160} />;
            case 2:
                return <Stage2Coinling size={160} />;
            case 3:
                return <Stage3Hodler size={160} />;
            case 4:
                return <Stage3Hodler size={160} />;
            case 5:
                return <Stage5Whale size={160} />;
            default:
                return <Stage1Egg size={160} />;
        }
    };

    return (
        <Modal
            visible={visible || isExiting}
            transparent
            animationType="none"
            onRequestClose={exit}
        >
            <Animated.View
                style={[
                    styles.backdrop,
                    { width, height },
                    containerStyle,
                ]}
            >
                <View style={styles.spotlight} />

                <Animated.View style={[styles.content, contentStyle]}>
                    <Text style={styles.evolved}>I evolved!</Text>

                    <View style={styles.petWrap}>{renderPet()}</View>

                    <Text style={styles.stageName}>
                        {stageName.split('•')[0].trim()}
                    </Text>

                    <Text style={styles.shareText}>{shareableMessage}</Text>

                    <Pressable onPress={exit} style={styles.button}>
                        <Text style={styles.buttonText}>Continue</Text>
                    </Pressable>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(7,17,31,0.92)',
        paddingHorizontal: 28,
    },
    spotlight: {
        position: 'absolute',
        width: 260,
        height: 260,
        borderRadius: 130,
        backgroundColor: 'rgba(114,228,90,0.08)',
    },
    content: {
        width: '100%',
        maxWidth: 320,
        alignItems: 'center',
    },
    evolved: {
        color: colors.primary,
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
        marginBottom: spacing.lg,
    },
    petWrap: {
        width: 180,
        height: 180,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.lg,
    },
    stageName: {
        color: colors.text,
        fontSize: typography.title,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
    },
    shareText: {
        marginTop: spacing.sm,
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
        lineHeight: 22,
    },
    button: {
        marginTop: spacing.xl,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: 999,
        backgroundColor: colors.primary,
    },
    buttonText: {
        color: colors.background,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
});
