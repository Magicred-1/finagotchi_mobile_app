import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, radius, spacing, typography } from '../theme/tokens';

export type WalletOption = {
    key: string;
    name: string;
    iconUrl?: string;
};

type Props = {
    visible: boolean;
    onClose: () => void;
    onSelect: (wallet: WalletOption) => void;
    options: WalletOption[];
    loading?: boolean;
};

export function WalletPickerSheet({
    visible,
    onClose,
    onSelect,
    options,
    loading,
}: Props) {
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(300);

    useEffect(() => {
        if (visible) {
            opacity.value = withSpring(1);
            translateY.value = withSpring(0);
        } else {
            opacity.value = withSpring(0);
            translateY.value = withSpring(300);
        }
    }, [visible, opacity, translateY]);

    const renderItem = ({ item }: { item: WalletOption }) => (
        <Pressable
            style={styles.row}
            onPress={() => onSelect(item)}
            disabled={loading}
        >
            {item.iconUrl ? (
                <Image source={{ uri: item.iconUrl }} style={styles.icon} />
            ) : (
                <View style={styles.iconPlaceholder}>
                    <Ionicons name="wallet-outline" size={20} color={colors.text} />
                </View>
            )}
            <Text style={styles.name}>{item.name}</Text>
            {loading && <ActivityIndicator size="small" color={colors.text} />}
        </Pressable>
    );

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
            <Animated.View style={[styles.overlay, { opacity }]}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Connect wallet</Text>
                        <Pressable onPress={onClose}>
                            <Ionicons name="close" size={24} color={colors.text} />
                        </Pressable>
                    </View>
                    <FlatList
                        data={options}
                        keyExtractor={(item) => item.key}
                        renderItem={renderItem}
                        contentContainerStyle={styles.list}
                        ListEmptyComponent={
                            <Text style={styles.empty}>No wallet options available.</Text>
                        }
                    />
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    sheet: {
        backgroundColor: colors.background,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        padding: spacing.lg,
        maxHeight: '70%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    title: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
    },
    list: {
        gap: spacing.sm,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
    },
    icon: {
        width: 32,
        height: 32,
        borderRadius: radius.sm,
    },
    iconPlaceholder: {
        width: 32,
        height: 32,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    name: {
        flex: 1,
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
    empty: {
        color: colors.textMuted,
        textAlign: 'center',
        fontFamily: 'Poppins_400Regular',
    },
});
