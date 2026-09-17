import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../components/Button';
import { PressableScale } from '../../components/PressableScale';
import { RadialPet } from '../../components/RadialPet';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type Props = {
    platform: 'ios' | 'android' | 'web';
    isSeeker: boolean;
    onConnectPasskey: () => Promise<void>;
    onConnectGoogle: () => Promise<void>;
    onConnectApple: () => Promise<void>;
    onRequestEmailOtp: (email: string) => Promise<void>;
    onVerifyEmailOtp: (otp: string) => Promise<void>;
    onConnectMwa: () => Promise<void>;
    onConnectOwnWallet: () => Promise<void>;
};

type AuthMethod =
    | 'passkey'
    | 'google'
    | 'apple'
    | 'email-request'
    | 'email-verify'
    | 'mwa'
    | 'own-wallet';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;

export default function ConnectWalletStep({
    platform,
    isSeeker,
    onConnectPasskey,
    onConnectGoogle,
    onConnectApple,
    onRequestEmailOtp,
    onVerifyEmailOtp,
    onConnectMwa,
    onConnectOwnWallet,
}: Props) {
    const [activeMethod, setActiveMethod] = useState<AuthMethod | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showEmail, setShowEmail] = useState(false);
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);

    const emailInputRef = useRef<TextInput>(null);

    useEffect(() => {
        if (showEmail && !otpSent) {
            // Small delay so the input is mounted when the keyboard opens.
            const timeout = setTimeout(() => {
                emailInputRef.current?.focus();
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [showEmail, otpSent]);

    const { width, height } = useWindowDimensions();
    const isSmall = height < 700;
    const isBusy = activeMethod !== null;

    const clearError = useCallback(() => setError(null), []);

    const run = useCallback(
        async (method: AuthMethod, action: () => Promise<void>) => {
            setActiveMethod(method);
            clearError();
            try {
                await action();
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : 'Failed to connect wallet. Please try again.'
                );
            } finally {
                setActiveMethod(null);
            }
        },
        [clearError]
    );

    const isLoading = useCallback(
        (method: AuthMethod) => activeMethod === method,
        [activeMethod]
    );

    const handlePasskey = useCallback(
        () => run('passkey', onConnectPasskey),
        [run, onConnectPasskey]
    );

    const handleGoogle = useCallback(
        () => run('google', onConnectGoogle),
        [run, onConnectGoogle]
    );

    const handleApple = useCallback(
        () => run('apple', onConnectApple),
        [run, onConnectApple]
    );

    const handleMwa = useCallback(
        () => run('mwa', onConnectMwa),
        [run, onConnectMwa]
    );

    const handleOwnWallet = useCallback(
        () => run('own-wallet', onConnectOwnWallet),
        [run, onConnectOwnWallet]
    );

    const handleRequestOtp = useCallback(() => {
        const trimmed = email.trim();
        if (!EMAIL_REGEX.test(trimmed)) {
            setError('Please enter a valid email address.');
            return;
        }
        run('email-request', async () => {
            await onRequestEmailOtp(trimmed);
            setOtpSent(true);
        });
    }, [email, run, onRequestEmailOtp]);

    const handleVerifyOtp = useCallback(() => {
        if (!otpSent) {
            setError('Request an OTP code first.');
            return;
        }
        const code = otp.trim();
        if (code.length < OTP_LENGTH) {
            setError(`Enter the ${OTP_LENGTH}-digit code.`);
            return;
        }
        run('email-verify', async () => {
            await onVerifyEmailOtp(code);
        });
    }, [otp, otpSent, run, onVerifyEmailOtp]);

    const resetEmail = useCallback(() => {
        setOtpSent(false);
        setOtp('');
        setEmail('');
        clearError();
    }, [clearError]);

    const renderEmailForm = () => (
        <View style={styles.emailBox}>
            {otpSent ? (
                <>
                    <Text style={styles.emailLabel}>
                        Enter the code sent to {email}
                    </Text>
                    <TextInput
                        style={[styles.input, styles.otpInput]}
                        placeholder="123456 or ABC123"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="default"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        autoFocus
                        value={otp}
                        onChangeText={(text) => {
                            setOtp(text);
                            if (error) clearError();
                        }}
                        onSubmitEditing={handleVerifyOtp}
                        maxLength={OTP_LENGTH}
                        accessibilityLabel="OTP code"
                        accessibilityHint={`Enter the ${OTP_LENGTH}-character code from your email`}
                    />
                    <Button
                        title="Verify code"
                        onPress={handleVerifyOtp}
                        loading={isLoading('email-verify')}
                        disabled={isBusy}
                    />
                    <View style={styles.emailActions}>
                        <PressableScale
                            onPress={handleRequestOtp}
                            disabled={isBusy}
                            style={styles.textButton}
                        >
                            <Text style={styles.textButtonLabel}>
                                Resend code
                            </Text>
                        </PressableScale>
                        <PressableScale
                            onPress={resetEmail}
                            disabled={isBusy}
                            style={styles.textButton}
                        >
                            <Text style={styles.textButtonLabel}>
                                Use a different email
                            </Text>
                        </PressableScale>
                    </View>
                </>
            ) : (
                <>
                    <TextInput
                        ref={emailInputRef}
                        style={styles.input}
                        placeholder="you@example.com"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        value={email}
                        onChangeText={(text) => {
                            setEmail(text);
                            if (error) clearError();
                        }}
                        onSubmitEditing={handleRequestOtp}
                        accessibilityLabel="Email address"
                    />
                    <Button
                        title="Send code"
                        onPress={handleRequestOtp}
                        loading={isLoading('email-request')}
                        disabled={isBusy}
                        variant="secondary"
                    />
                </>
            )}
        </View>
    );

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                style={styles.keyboard}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                >
                    <View
                        style={[
                            styles.container,
                            {
                                paddingHorizontal: Math.min(
                                    Math.max(width * 0.06, 24),
                                    40
                                ),
                            },
                        ]}
                    >
                        <View style={styles.hero}>
                            <View
                                style={[
                                    styles.creatureWrap,
                                    isSmall && styles.creatureWrapSmall,
                                ]}
                            >
                                <RadialPet
                                    stage="egg"
                                    mood="calm"
                                    size={isSmall ? 88 : 120}
                                />
                            </View>
                            <Text
                                style={[
                                    styles.title,
                                    isSmall && styles.titleSmall,
                                ]}
                            >
                                Sign in
                            </Text>
                            <Text style={styles.body}>
                                Connect a wallet to mint your Finagotchi.
                            </Text>
                        </View>

                        <View style={styles.footer}>
                            {(isSeeker || platform === 'android') && (
                                <>
                                    <View style={styles.stack}>
                                        <Button
                                            title="Connect Solana Mobile Wallet"
                                            onPress={handleMwa}
                                            loading={isLoading('mwa')}
                                            disabled={isBusy}
                                            icon={
                                                <Ionicons
                                                    name="wallet-outline"
                                                    size={20}
                                                    color="#07111F"
                                                />
                                            }
                                        />
                                        <Text style={styles.hint}>
                                            {isSeeker
                                                ? 'Use the built-in Seeker wallet.'
                                                : 'Solana Mobile Wallet or any MWA-compatible wallet.'}
                                        </Text>
                                    </View>

                                    <View style={styles.divider}>
                                        <View style={styles.dividerLine} />
                                        <Text style={styles.dividerText}>
                                            or
                                        </Text>
                                        <View style={styles.dividerLine} />
                                    </View>
                                </>
                            )}

                            <View style={styles.stack}>
                                {platform === 'ios' && (
                                    <Button
                                        title="Continue with Apple"
                                        onPress={handleApple}
                                        loading={isLoading('apple')}
                                        disabled={isBusy}
                                        variant="secondary"
                                        icon={
                                            <Ionicons
                                                name="logo-apple"
                                                size={20}
                                                color={colors.text}
                                            />
                                        }
                                    />
                                )}

                                <Button
                                    title="Continue with Google"
                                    onPress={handleGoogle}
                                    loading={isLoading('google')}
                                    disabled={isBusy}
                                    variant="secondary"
                                    icon={
                                        <Ionicons
                                            name="logo-google"
                                            size={20}
                                            color={colors.text}
                                        />
                                    }
                                />

                                {showEmail ? (
                                    renderEmailForm()
                                ) : (
                                    <Button
                                        title="Continue with Email"
                                        onPress={() => {
                                            setShowEmail(true);
                                            clearError();
                                        }}
                                        disabled={isBusy}
                                        variant="secondary"
                                        icon={
                                            <Ionicons
                                                name="mail-outline"
                                                size={20}
                                                color={colors.text}
                                            />
                                        }
                                    />
                                )}

                                <Button
                                    title="Continue with Passkey"
                                    onPress={handlePasskey}
                                    loading={isLoading('passkey')}
                                    disabled={isBusy}
                                    variant="secondary"
                                    icon={
                                        <Ionicons
                                            name="finger-print-outline"
                                            size={20}
                                            color={colors.text}
                                        />
                                    }
                                />
                                <Text style={styles.hint}>
                                    Passkey sign-in works once you have signed
                                    in with email or Google on this device.
                                </Text>

                                <View style={styles.divider}>
                                    <View style={styles.dividerLine} />
                                    <Text style={styles.dividerText}>or</Text>
                                    <View style={styles.dividerLine} />
                                </View>

                                <Button
                                    title="Connect your wallet"
                                    onPress={handleOwnWallet}
                                    loading={isLoading('own-wallet')}
                                    disabled={isBusy}
                                    variant="secondary"
                                    icon={
                                        <Ionicons
                                            name="wallet-outline"
                                            size={20}
                                            color={colors.text}
                                        />
                                    }
                                />
                            </View>

                            {error ? (
                                <Text style={styles.error}>{error}</Text>
                            ) : null}
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: colors.background,
    },
    keyboard: {
        flex: 1,
    },
    scroll: {
        flexGrow: 1,
    },
    container: {
        flex: 1,
        justifyContent: 'center',
        gap: spacing.xl,
        paddingVertical: spacing.xl,
    },
    hero: {
        alignItems: 'center',
    },
    creatureWrap: {
        width: 120,
        height: 120,
        marginBottom: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    creatureWrapSmall: {
        width: 88,
        height: 88,
        marginBottom: spacing.sm,
    },
    title: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
        textAlign: 'center',
        marginBottom: spacing.xs,
    },
    titleSmall: {
        fontSize: 28,
    },
    body: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 22,
        maxWidth: 280,
    },
    footer: {
        width: '100%',
        maxWidth: 340,
        alignSelf: 'center',
        gap: spacing.md,
    },
    stack: {
        width: '100%',
        gap: spacing.sm,
    },
    emailBox: {
        width: '100%',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    emailLabel: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
        marginBottom: spacing.xs,
    },
    emailActions: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.md,
        flexWrap: 'wrap',
    },
    input: {
        width: '100%',
        minHeight: 48,
        borderRadius: radius.sm,
        paddingHorizontal: spacing.md,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        color: colors.text,
        fontFamily: 'Poppins_400Regular',
        fontSize: typography.body,
    },
    otpInput: {
        textAlign: 'center',
        letterSpacing: 8,
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 20,
    },
    textButton: {
        alignItems: 'center',
        paddingVertical: spacing.sm,
        minHeight: 44,
        justifyContent: 'center',
    },
    textButtonLabel: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
    error: {
        color: colors.danger,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
    },
    hint: {
        color: colors.textMuted,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 18,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: colors.border,
    },
    dividerText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
});
