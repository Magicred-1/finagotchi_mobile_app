import React, { useState } from 'react';

import {
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { Button } from '../../src/components/Button';
import { useWalletStore } from '../../src/features/wallet/store';
import { colors, spacing } from '../../src/theme/tokens';

export default function CompanionScreen() {
    const [input, setInput] = useState('');
    const [error, setError] = useState('');

    const address = useWalletStore(
        (state) => state.address
    );

    const connect = useWalletStore(
        (state) => state.connect
    );

    const disconnect = useWalletStore(
        (state) => state.disconnect
    );

    function handleConnect() {
        const success = connect(input.trim());

        if (!success) {
        setError('Invalid Solana address.');
        return;
        }

        setError('');
        setInput('');
    }

    if (address) {
        return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.container}>
            <Text style={styles.emoji}>🔗</Text>

            <Text style={styles.title}>
                Wallet connected
            </Text>

            <Text style={styles.label}>
                Read-only Solana wallet
            </Text>

            <View style={styles.addressBox}>
                <Text style={styles.address}>
                {address}
                </Text>
            </View>

            <Text style={styles.info}>
                Finagotchi cannot move your funds.
            </Text>

            <Button
                title="DISCONNECT"
                onPress={disconnect}
            />
            </View>
        </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
            <Text style={styles.emoji}>◎</Text>

            <Text style={styles.title}>
            Your companion wallet
            </Text>

            <Text style={styles.subtitle}>
            Connect a Solana wallet to give your pet
            context about your financial journey.
            </Text>

            <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Solana wallet address"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            />

            {error ? (
            <Text style={styles.error}>
                {error}
            </Text>
            ) : null}

            <Button
            title="CONNECT WALLET"
            onPress={handleConnect}
            disabled={!input.trim()}
            />

            <Text style={styles.info}>
            Read-only. No private keys required.
            </Text>
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
        padding: spacing.lg,
        justifyContent: 'center',
    },

    emoji: {
        fontSize: 60,
        textAlign: 'center',
        color: colors.purple,
    },

    title: {
        color: colors.text,
        fontSize: 28,
        fontWeight: '900',
        textAlign: 'center',
        marginTop: spacing.md,
    },

    subtitle: {
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 23,
        marginVertical: spacing.lg,
    },

    label: {
        color: colors.primary,
        textAlign: 'center',
        marginTop: spacing.sm,
    },

    input: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        color: colors.text,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },

    error: {
        color: colors.danger,
        marginBottom: spacing.md,
    },

    addressBox: {
        backgroundColor: colors.surface,
        padding: spacing.md,
        borderRadius: 12,
        marginVertical: spacing.lg,
    },

    address: {
        color: colors.text,
        fontSize: 12,
    },

    info: {
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: spacing.lg,
    },
});