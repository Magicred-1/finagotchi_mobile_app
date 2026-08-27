import React, { useState } from 'react';
import {
    Alert,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { colors, radius, spacing, typography } from '../theme/tokens';

const COMMUNITY_REVIVE_COST = 250;

const FAKE_FRIENDS = [
    { id: 'friend-1', name: 'SolanaWhale', canHelp: true },
    { id: 'friend-2', name: 'DegenMom', canHelp: true },
    { id: 'friend-3', name: 'NFTCollector', canHelp: false },
];

type Props = {
    visible: boolean;
    onClose: () => void;
    creatureName: string;
    balance: number;
    onResurrect: () => void;
};

export default function CommunityResurrectSheet({
    visible,
    onClose,
    creatureName,
    balance,
    onResurrect,
}: Props) {
    const [address, setAddress] = useState('');

    function handleHelpFromFriend(friendId: string) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Request sent', 'Your friend will receive a notification.');
        onClose();
    }

    async function handleShare() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            await Share.share({
                message: `${creatureName} turned spectral and needs the community's help to revive. Can you help?`,
                url: 'https://www.finagotchi.app/resurrect?ref=community',
                title: `Help revive ${creatureName}`,
            });
        } catch {
            // ignore
        }
    }

    function handlePayStranger() {
        const trimmed = address.trim();
        if (!trimmed) {
            Alert.alert('Address required', 'Enter a helper address to send the reward.');
            return;
        }
        if (balance < COMMUNITY_REVIVE_COST) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Not enough points', `Community reward costs ${COMMUNITY_REVIVE_COST} points.`);
            return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onResurrect();
        onClose();
    }

    return (
        <BottomSheet visible={visible} onClose={onClose} title="Community resurrection">
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.container}
            >
                <Text style={styles.body}>
                    Ask a friend or a community helper to bring {creatureName} back.
                </Text>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Share a request</Text>
                    <Button
                        title="Share revive request"
                        onPress={handleShare}
                        variant="secondary"
                        icon={
                            <Ionicons
                                name="share-outline"
                                size={18}
                                color={colors.text}
                            />
                        }
                    />
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Pay a helper</Text>
                    <Text style={styles.hint}>
                        Send {COMMUNITY_REVIVE_COST} points to a helper and they will resurrect your companion.
                    </Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Helper Solana address"
                        placeholderTextColor={colors.textMuted}
                        value={address}
                        onChangeText={setAddress}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <Button
                        title={`Pay ${COMMUNITY_REVIVE_COST} points`}
                        onPress={handlePayStranger}
                        disabled={balance < COMMUNITY_REVIVE_COST}
                    />
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Friends</Text>
                    {FAKE_FRIENDS.map((friend) => (
                        <PressableScale
                            key={friend.id}
                            onPress={() => handleHelpFromFriend(friend.id)}
                            disabled={!friend.canHelp}
                            style={[
                                styles.friendRow,
                                !friend.canHelp && styles.friendRowDisabled,
                            ]}
                        >
                            <View style={styles.friendAvatar}>
                                <Text style={styles.friendInitial}>
                                    {friend.name[0]}
                                </Text>
                            </View>
                            <Text style={styles.friendName}>{friend.name}</Text>
                            {friend.canHelp ? (
                                <Text style={styles.friendStatus}>Can help</Text>
                            ) : (
                                <Text style={styles.friendStatusOffline}>Offline</Text>
                            )}
                        </PressableScale>
                    ))}
                </View>

                <Text style={styles.disclaimer}>
                    Community resurrection is a local MVP. Real on-chain logic coming soon.
                </Text>
            </ScrollView>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingBottom: 32,
        gap: spacing.lg,
    },
    body: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 24,
    },
    section: {
        gap: spacing.sm,
    },
    sectionTitle: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    hint: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 20,
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
    friendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    friendRowDisabled: {
        opacity: 0.5,
    },
    friendAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(93,226,166,0.15)',
    },
    friendInitial: {
        color: colors.primary,
        fontSize: typography.body,
        fontFamily: 'Poppins_800ExtraBold',
    },
    friendName: {
        flex: 1,
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
    friendStatus: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
    },
    friendStatusOffline: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
    },
    disclaimer: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 20,
    },
});
