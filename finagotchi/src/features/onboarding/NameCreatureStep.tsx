import React, { useRef, useState } from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from 'react-native';

import { Button } from '../../components/Button';
import { RadialPet } from '../../components/RadialPet';
import { LandingGradient } from '../../components/LandingGradient';
import { FadeInUp } from './FadeInUp';
import { fonts, landing, radius, spacing, tracking, typography } from '../../theme/tokens';

const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height';

type Props = {
    onSubmit: (name: string) => void;
};

export default function NameCreatureStep({ onSubmit }: Props) {
    const [name, setName] = useState('');
    const [focused, setFocused] = useState(false);
    const { width, height } = useWindowDimensions();
    const scrollRef = useRef<ScrollView>(null);

    const isSmall = height < 700;
    const isTiny = width < 360;
    const horizontalPadding = Math.min(Math.max(width * 0.06, 24), 40);

    const canSubmit = name.trim().length > 0;

    const scrollToForm = () => {
        // Give the keyboard a moment to animate in before scrolling
        // so the ScrollView can measure the new visible area correctly.
        setTimeout(() => {
            scrollRef.current?.scrollToEnd({ animated: true });
        }, 150);
    };

    return (
        <SafeAreaView style={styles.safe}>
            <LandingGradient />
            <KeyboardAvoidingView
                behavior={KEYBOARD_BEHAVIOR}
                style={styles.keyboard}
                keyboardVerticalOffset={0}
            >
                <ScrollView
                    ref={scrollRef}
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >
                    <Pressable
                        style={styles.dismissArea}
                        onPress={Keyboard.dismiss}
                    >
                        <FadeInUp style={[styles.content, { paddingHorizontal: horizontalPadding }]}>
                            <View style={[styles.creatureWrap, isSmall && styles.creatureWrapSmall]}>
                                <RadialPet stage="egg" mood="calm" size={isSmall ? 96 : 128} />
                            </View>
                            <Text
                                style={[
                                    styles.title,
                                    isSmall && styles.titleSmall,
                                    isTiny && styles.titleTiny,
                                ]}
                            >
                                Name your creature
                            </Text>
                            <Text
                                style={[
                                    styles.body,
                                    isSmall && styles.bodySmall,
                                ]}
                            >
                                Give your Finagotchi a name before minting it as your
                                on-chain companion.
                            </Text>
                        </FadeInUp>

                        <FadeInUp delay={160} style={[styles.form, { paddingHorizontal: horizontalPadding }]}>
                            <TextInput
                                value={name}
                                onChangeText={setName}
                                placeholder="e.g. Solana, Finny, HODLbot"
                                placeholderTextColor={landing.placeholder}
                                style={[styles.input, focused && styles.inputFocused]}
                                maxLength={24}
                                autoFocus
                                returnKeyType="done"
                                onFocus={() => {
                                    setFocused(true);
                                    scrollToForm();
                                }}
                                onBlur={() => setFocused(false)}
                                onSubmitEditing={() => {
                                    if (canSubmit) onSubmit(name.trim());
                                }}
                            />
                            <Button
                                title="Continue"
                                onPress={() => onSubmit(name.trim())}
                                disabled={!canSubmit}
                                tone="landing"
                            />
                        </FadeInUp>
                    </Pressable>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: landing.navy,
    },
    keyboard: {
        flex: 1,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    dismissArea: {
        flex: 1,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    creatureWrap: {
        width: 128,
        height: 128,
        marginBottom: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    creatureWrapSmall: {
        width: 96,
        height: 96,
        marginBottom: spacing.sm,
    },
    title: {
        color: landing.text,
        fontSize: typography.title,
        fontFamily: fonts.medium,
        letterSpacing: tracking.title,
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    titleSmall: {
        fontSize: 28,
    },
    titleTiny: {
        fontSize: 24,
    },
    body: {
        color: landing.textMuted,
        fontSize: typography.body,
        fontFamily: fonts.regular,
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 320,
    },
    bodySmall: {
        fontSize: 14,
        lineHeight: 20,
    },
    form: {
        width: '100%',
        gap: spacing.md,
        paddingBottom: spacing.lg,
    },
    input: {
        backgroundColor: landing.frostSurface,
        color: landing.ink,
        borderWidth: 1,
        borderColor: landing.frostBorder,
        borderRadius: radius.sm,
        minHeight: 54,
        paddingVertical: 15,
        paddingHorizontal: 16,
        fontSize: typography.body,
        fontFamily: fonts.medium,
    },
    inputFocused: {
        borderColor: landing.accent,
    },
});
