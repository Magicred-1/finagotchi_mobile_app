import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
    type ImageSourcePropType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, withSpring } from 'react-native-reanimated';

import { fonts, gradients, gradientStops, landing, radius, spacing, tracking, typography } from '../theme/tokens';
import { GradientFill } from './GradientFill';
import { SoftGlow } from './SoftGlow';

/**
 * Bundled logos for the wallets the picker offers (the Dynamic catalogue only
 * provides sprite sheets, so remote iconUrl is unreliable). Official App
 * Store icons; keyed by the catalogue's wallet key.
 */
const LOCAL_WALLET_ICONS: Record<string, ImageSourcePropType> = {
    phantom: require('../../assets/wallets/phantom.jpg'),
    metamask: require('../../assets/wallets/metamask.jpg'),
    backpack: require('../../assets/wallets/backpack.jpg'),
    solflare: require('../../assets/wallets/solflare.jpg'),
};

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

function WalletIcon({ walletKey, iconUrl, name }: { walletKey: string; iconUrl?: string; name: string }) {
    const [failed, setFailed] = useState(false);

    const local = LOCAL_WALLET_ICONS[walletKey];
    if (local) {
        return <Image source={local} style={styles.icon} resizeMode="cover" />;
    }

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
                    <GradientFill
                        colors={gradients.landingDialog}
                        locations={gradientStops.landingDialog}
                        start={{ x: 0.2, y: 0 }}
                        end={{ x: 0.8, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <SoftGlow
                        color={landing.dialogHighlight}
                        style={styles.dialogHighlight}
                    />
                    <View style={styles.header}>
                        <Text style={styles.title}>Connect wallet</Text>
                        <Pressable
                            onPress={onClose}
                            style={styles.closeButton}
                            accessibilityLabel="Close wallet picker"
                        >
                            <Ionicons name="close" size={24} color={landing.text} />
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
                                    <WalletIcon walletKey={item.key} iconUrl={item.iconUrl} name={item.name} />
                                </View>
                                <Text style={styles.walletName} numberOfLines={1}>
                                    {item.name}
                                </Text>
                                {loading ? (
                                    <ActivityIndicator size="small" color={landing.text} />
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
        backgroundColor: landing.backdrop,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    sheet: {
        backgroundColor: landing.navy,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        borderTopWidth: 1,
        borderColor: landing.glassBorderStrong,
        overflow: 'hidden',
        padding: spacing.lg,
        paddingBottom: spacing.xl,
    },
    dialogHighlight: {
        position: 'absolute',
        top: '-18%',
        right: '-25%',
        width: '70%',
        height: '55%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    closeButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: -spacing.sm,
    },
    title: {
        color: landing.text,
        fontSize: typography.heading,
        fontFamily: fonts.medium,
        letterSpacing: tracking.heading,
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
        backgroundColor: landing.glass,
        borderWidth: 1,
        borderColor: landing.glassBorder,
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
        backgroundColor: landing.glassActive,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fallbackLetter: {
        color: landing.text,
        fontSize: 20,
        fontFamily: fonts.semiBold,
    },
    walletName: {
        color: landing.text,
        fontSize: typography.small,
        fontFamily: fonts.medium,
        textAlign: 'center',
        maxWidth: 72,
    },
    empty: {
        color: landing.textMuted,
        textAlign: 'center',
        fontFamily: fonts.regular,
        marginTop: spacing.md,
    },
});
