import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
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

function WalletIcon({ iconUrl, name }: { iconUrl?: string; name: string }) {
    const [failed, setFailed] = useState(false);

    if (iconUrl && !failed) {
        return (
            <Image
                source={{ uri: iconUrl }}
                style={styles.icon}
                resizeMode="contain"
                onError={() => setFailed(true)}
            />
        );
    }

    return (
        <View style={styles.iconPlaceholder}>
            <Text style={styles.fallbackLetter}>
                {name ? name[0].toUpperCase() : 'W'}
            </Text>
        </View>
    );
}

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

                    <View style={styles.row}>
                        {options.map((item) => (
                            <Pressable
                                key={item.key}
                                style={styles.walletButton}
                                onPress={() => onSelect(item)}
                                disabled={loading}
                            >
                                <View style={styles.iconWrapper}>
                                    <WalletIcon iconUrl={item.iconUrl} name={item.name} />
                                </View>
                                <Text style={styles.walletName} numberOfLines={1}>
                                    {item.name}
                                </Text>
                                {loading ? (
                                    <ActivityIndicator size="small" color={colors.text} />
                                ) : null}
                            </Pressable>
                        ))}
                    </View>

                    {options.length === 0 ? (
                        <Text style={styles.empty}>No wallet options available.</Text>
                    ) : null}
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
        paddingBottom: spacing.xl,
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
    row: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.md,
        flexWrap: 'wrap',
    },
    walletButton: {
        width: 72,
        alignItems: 'center',
        gap: spacing.xs,
    },
    iconWrapper: {
        width: 64,
        height: 64,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.sm,
    },
    icon: {
        width: 40,
        height: 40,
    },
    iconPlaceholder: {
        width: 40,
        height: 40,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fallbackLetter: {
        color: colors.text,
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
    },
    walletName: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
        maxWidth: 72,
    },
    empty: {
        color: colors.textMuted,
        textAlign: 'center',
        fontFamily: 'Poppins_400Regular',
        marginTop: spacing.md,
    },
});
