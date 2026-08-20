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
import { colors, radius, spacing, typography } from '../../theme/tokens';

const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height';

type Props = {
    onSubmit: (name: string) => void;
};

export default function NameCreatureStep({ onSubmit }: Props) {
    const [name, setName] = useState('');
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
                        <View style={[styles.content, { paddingHorizontal: horizontalPadding }]}>
                            <Text
                                style={[
                                    styles.creature,
                                    isSmall && styles.creatureSmall,
                                ]}
                            >
                                🐣
                            </Text>
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
                        </View>

                        <View style={[styles.form, { paddingHorizontal: horizontalPadding }]}>
                            <TextInput
                                value={name}
                                onChangeText={setName}
                                placeholder="e.g. Solana, Finny, HODLbot"
                                placeholderTextColor={colors.textMuted}
                                style={styles.input}
                                maxLength={24}
                                autoFocus
                                returnKeyType="done"
                                onFocus={scrollToForm}
                                onSubmitEditing={() => {
                                    if (canSubmit) onSubmit(name.trim());
                                }}
                            />
                            <Button
                                title="Continue"
                                onPress={() => onSubmit(name.trim())}
                                disabled={!canSubmit}
                            />
                        </View>
                    </Pressable>
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
    creature: {
        fontSize: 96,
        marginBottom: spacing.lg,
    },
    creatureSmall: {
        fontSize: 72,
        marginBottom: spacing.md,
    },
    title: {
        color: colors.text,
        fontSize: typography.title,
        fontFamily: 'Poppins_700Bold',
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
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
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
        backgroundColor: colors.surface,
        color: colors.text,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
    },
});
