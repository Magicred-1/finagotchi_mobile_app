import React from 'react';

import {
    SafeAreaView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { colors, spacing } from '../../src/theme/tokens';

export default function SettingsScreen() {
    return (
        <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
            <Text style={styles.title}>
            Settings
            </Text>

            <View style={styles.row}>
            <Text style={styles.label}>
                Notifications
            </Text>

            <Text style={styles.value}>
                Enabled
            </Text>
            </View>

            <View style={styles.row}>
            <Text style={styles.label}>
                Network
            </Text>

            <Text style={styles.value}>
                Solana
            </Text>
            </View>

            <Text style={styles.version}>
            Finagotchi MVP • Phase 1
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
        padding: spacing.lg,
    },

    title: {
        color: colors.text,
        fontSize: 30,
        fontWeight: '900',
        marginBottom: spacing.lg,
    },

    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },

    label: {
        color: colors.text,
        fontSize: 16,
    },

    value: {
        color: colors.primary,
    },

    version: {
        color: colors.textMuted,
        marginTop: spacing.xl,
    },
});