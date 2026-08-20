import React, { useState } from 'react';
import {
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from 'react-native';

import { Button } from '../../components/Button';
import { colors, spacing, typography } from '../../theme/tokens';

type Props = {
    onSubmit: (name: string) => void;
};

export default function NameCreatureStep({ onSubmit }: Props) {
    const [name, setName] = useState('');
    const { width, height } = useWindowDimensions();

    const isSmall = height < 700;
    const isTiny = width < 360;

    const canSubmit = name.trim().length > 0;

    return (
        <SafeAreaView style={styles.safe}>
            <View
                style={[
                    styles.container,
                    {
                        paddingHorizontal: Math.min(Math.max(width * 0.06, 24), 40),
                        paddingVertical: isSmall ? spacing.lg : spacing.xl,
                    },
                ]}
            >
                <View style={styles.content}>
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

                <View style={styles.form}>
                    <TextInput
                        value={name}
                        onChangeText={setName}
                        placeholder="e.g. Solana, Finny, HODLbot"
                        placeholderTextColor={colors.textMuted}
                        style={styles.input}
                        maxLength={24}
                        autoFocus
                        returnKeyType="done"
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
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: colors.background,
    },
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
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
