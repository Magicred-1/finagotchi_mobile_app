import React, { useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { useWaitlistStore } from '../features/waitlist/store';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
    visible: boolean;
    onClose: () => void;
};

const BULLETS = [
    {
        icon: 'paw-outline' as const,
        title: 'Your pet, in your pocket',
        body: 'A tiny physical Finagotchi that mirrors your streak and mood.',
    },
    {
        icon: 'finger-print-outline' as const,
        title: 'One-tap check-ins',
        body: 'Tap the device to mark your daily save — no phone required.',
    },
    {
        icon: 'color-wand-outline' as const,
        title: 'LED + haptic moods',
        body: 'It glows, pulses, and buzzes to celebrate milestones with you.',
    },
    {
        icon: 'shield-checkmark-outline' as const,
        title: 'No keys on the device',
        body: 'Your wallet stays on your phone; the companion only reads public streak data.',
    },
];

export default function WaitlistSheet({ visible, onClose }: Props) {
    const addEntry = useWaitlistStore((state) => state.addEntry);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = () => {
        const trimmedName = name.trim();
        const success = addEntry(email, trimmedName || undefined);

        if (success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setStatus('success');
            setError(null);
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setStatus('error');
            setError('Please enter a valid email address.');
        }
    };

    const handleClose = () => {
        setName('');
        setEmail('');
        setStatus('idle');
        setError(null);
        onClose();
    };

    return (
        <BottomSheet
            visible={visible}
            onClose={handleClose}
            title="Hardware Companion"
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.keyboard}
            >
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.container}
                    keyboardShouldPersistTaps="handled"
                >
                    {status === 'success' ? (
                        <View style={styles.success}>
                            <Text style={styles.successEmoji}>🎉</Text>
                            <Text style={styles.successTitle}>
                                You're on the list!
                            </Text>
                            <Text style={styles.successBody}>
                                We'll reach out when the Finagotchi Hardware
                                Companion is ready for early supporters.
                            </Text>

                            <Button
                                title="Close"
                                onPress={handleClose}
                                variant="secondary"
                            />
                        </View>
                    ) : (
                        <>
                            <View style={styles.hero}>
                                <View style={styles.heroIconWrap}>
                                    <Ionicons
                                        name="hardware-chip-outline"
                                        size={32}
                                        color={colors.primary}
                                    />
                                </View>
                                <Text style={styles.heroTitle}>
                                    Finagotchi Hardware Companion
                                </Text>
                                <Text style={styles.heroBody}>
                                    A physical sidekick that brings your pet off
                                    the screen and into your daily routine.
                                </Text>
                            </View>

                            <View style={styles.bullets}>
                                {BULLETS.map((bullet) => (
                                    <View
                                        key={bullet.title}
                                        style={styles.bullet}
                                    >
                                        <View style={styles.bulletIcon}>
                                            <Ionicons
                                                name={bullet.icon}
                                                size={18}
                                                color={colors.primary}
                                            />
                                        </View>
                                        <View style={styles.bulletText}>
                                            <Text style={styles.bulletTitle}>
                                                {bullet.title}
                                            </Text>
                                            <Text style={styles.bulletBody}>
                                                {bullet.body}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>

                            <Text style={styles.formLead}>
                                Want early access? Leave your email and we'll
                                send you a heads-up when pre-orders open.
                            </Text>

                            <View style={styles.form}>
                                <TextInput
                                    value={name}
                                    onChangeText={setName}
                                    placeholder="Name (optional)"
                                    placeholderTextColor={colors.textMuted}
                                    style={styles.input}
                                    autoCapitalize="words"
                                />

                                <TextInput
                                    value={email}
                                    onChangeText={setEmail}
                                    placeholder="Email address"
                                    placeholderTextColor={colors.textMuted}
                                    style={styles.input}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />

                                {error ? (
                                    <Text style={styles.error}>{error}</Text>
                                ) : null}

                                <Button
                                    title="Join the waitlist"
                                    onPress={handleSubmit}
                                />

                                <Pressable
                                    onPress={handleClose}
                                    style={styles.later}
                                >
                                    <Text style={styles.laterText}>
                                        Maybe later
                                    </Text>
                                </Pressable>
                            </View>
                        </>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingBottom: 32,
    },
    keyboard: {
        flex: 1,
    },
    hero: {
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    heroIconWrap: {
        width: 72,
        height: 72,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 24,
        backgroundColor: 'rgba(93,226,166,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(93,226,166,0.20)',
        marginBottom: spacing.md,
    },
    heroTitle: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
        textAlign: 'center',
        marginBottom: spacing.sm,
    },
    heroBody: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 300,
    },
    bullets: {
        gap: spacing.md,
        marginBottom: spacing.xl,
    },
    bullet: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
    },
    bulletIcon: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: 'rgba(93,226,166,0.08)',
    },
    bulletText: {
        flex: 1,
        gap: 2,
    },
    bulletTitle: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    bulletBody: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 20,
    },
    formLead: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
        lineHeight: 24,
        marginBottom: spacing.md,
    },
    form: {
        gap: spacing.md,
    },
    input: {
        backgroundColor: colors.background,
        color: colors.text,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
    },
    error: {
        color: colors.danger,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    later: {
        alignItems: 'center',
        paddingVertical: spacing.sm,
    },
    laterText: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
    success: {
        alignItems: 'center',
        paddingVertical: spacing.xl,
    },
    successEmoji: {
        fontSize: 64,
        marginBottom: spacing.md,
    },
    successTitle: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        marginBottom: spacing.sm,
    },
    successBody: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: spacing.xl,
        maxWidth: 300,
    },
});
