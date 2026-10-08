import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PublicKey } from '@solana/web3.js';

import { useLeagueStore, type LeaderboardEntry } from '../features/league/store';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { PressableScale } from './PressableScale';
import {
    addFriend,
    fetchLeaderboard,
    removeFriend,
    setProfileName,
    type DbsLeaderboardResponse,
} from '../features/dbs/client';
import { useWalletStore } from '../features/wallet/store';

interface Props {
    visible: boolean;
    onClose: () => void;
}

/** Server-side display name limit (POST /dbs/profile 400s beyond it). */
const DISPLAY_NAME_MAX = 24;

function shortWallet(wallet: string): string {
    return wallet.slice(0, 4) + '...' + wallet.slice(-4);
}

function toEntry(entry: {
    wallet: string;
    score: number;
    displayName: string;
    tier: string;
    isFriend?: boolean;
}): LeaderboardEntry {
    return {
        userId: entry.wallet,
        name: entry.displayName || shortWallet(entry.wallet),
        score: entry.score,
        tier: entry.tier as LeaderboardEntry['tier'],
        isFriend: entry.isFriend,
    };
}

/** Client-side base58 Solana address check before hitting the API. */
function isValidSolanaAddress(address: string): boolean {
    try {
        new PublicKey(address.trim());
        return true;
    } catch {
        return false;
    }
}

export function LeaderboardSheet({ visible, onClose }: Props) {
    const scope = useLeagueStore((s) => s.leaderboardScope);
    const setScope = useLeagueStore((s) => s.setScope);
    const localScore = useLeagueStore((s) => s.score);
    const localTier = useLeagueStore((s) => s.currentTier);
    const syncFromServer = useLeagueStore((s) => s.syncFromServer);
    const wallet = useWalletStore((s) => s.address);
    const { height: windowHeight } = useWindowDimensions();

    const [data, setData] = useState<DbsLeaderboardResponse | null>(null);
    const [failed, setFailed] = useState(false);
    // True while a mutation refetch is in flight — stale rows stay visible.
    const [mutating, setMutating] = useState(false);

    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [nameError, setNameError] = useState<string | null>(null);

    const [friendDraft, setFriendDraft] = useState('');
    const [friendError, setFriendError] = useState<string | null>(null);

    // Stale-while-revalidate: never clear `data` on a refetch failure, only
    // surface the error state when there is nothing to show at all.
    const reload = useCallback(async () => {
        if (!wallet) return;
        try {
            const res = await fetchLeaderboard(wallet);
            setData(res);
            setFailed(false);
        } catch {
            setFailed((prev) => prev || data === null);
        }
    }, [wallet, data]);

    useEffect(() => {
        if (!visible || !wallet) return;
        setFailed(false);
        syncFromServer().catch(() => {});
        void reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, wallet]);

    // Closing the sheet drops any half-finished edits.
    useEffect(() => {
        if (visible) return;
        setEditingName(false);
        setNameError(null);
        setFriendDraft('');
        setFriendError(null);
    }, [visible]);

    const entries = useMemo(() => {
        const rows = scope === 'global' ? data?.global : data?.friends;
        // The own row is pinned above the list — never duplicated inside it.
        const mapped = (rows ?? [])
            .filter((entry) => entry.wallet !== wallet)
            .map(toEntry);
        mapped.sort((a, b) => b.score - a.score);
        return mapped;
    }, [scope, data, wallet]);

    const ownEntry: LeaderboardEntry | null = useMemo(() => {
        if (!wallet) return null;
        const own = data?.own;
        return own
            ? { ...toEntry(own), name: 'You' }
            : { userId: wallet, name: 'You', score: localScore, tier: localTier };
    }, [wallet, data, localScore, localTier]);

    const ownRank = useMemo(() => {
        if (!wallet || !data) return null;
        const sorted = [...data.global].sort((a, b) => b.score - a.score);
        const index = sorted.findIndex((entry) => entry.wallet === wallet);
        return index >= 0 ? index + 1 : null;
    }, [wallet, data]);

    async function handleSaveName() {
        if (!wallet) return;
        const displayName = nameDraft.trim();
        if (displayName.length > DISPLAY_NAME_MAX) {
            setNameError(`Keep it under ${DISPLAY_NAME_MAX} characters.`);
            return;
        }
        setMutating(true);
        setNameError(null);
        try {
            // '' clears the name server-side; the row falls back to wallet.
            await setProfileName(wallet, displayName);
            await reload();
            setEditingName(false);
        } catch (e) {
            setNameError(
                (e as { status?: number }).status === 400
                    ? `Keep it under ${DISPLAY_NAME_MAX} characters.`
                    : 'Could not save — try again.'
            );
        } finally {
            setMutating(false);
        }
    }

    async function handleAddFriend() {
        if (!wallet) return;
        const friendWallet = friendDraft.trim();
        if (!isValidSolanaAddress(friendWallet)) {
            setFriendError('Enter a valid Solana wallet address.');
            return;
        }
        if (friendWallet === wallet) {
            setFriendError("That's your own wallet.");
            return;
        }
        setMutating(true);
        setFriendError(null);
        try {
            await addFriend(wallet, friendWallet);
            setFriendDraft('');
            await reload();
        } catch (e) {
            setFriendError(
                (e as { status?: number }).status === 400
                    ? 'Enter a valid Solana wallet address.'
                    : 'Could not add — try again.'
            );
        } finally {
            setMutating(false);
        }
    }

    async function handleRemoveFriend(friendWallet: string) {
        if (!wallet) return;
        setMutating(true);
        try {
            await removeFriend(wallet, friendWallet);
            await reload();
        } catch {
            setFriendError('Could not remove — try again.');
        } finally {
            setMutating(false);
        }
    }

    function renderRow({ item, index }: { item: LeaderboardEntry; index: number }) {
        return (
            <View style={styles.row}>
                <Text style={styles.rank}>{index + 1}</Text>
                <View
                    style={[
                        styles.avatar,
                        {
                            backgroundColor: item.isFriend
                                ? colors.purple
                                : colors.surfaceLight,
                        },
                    ]}
                >
                    <Text style={styles.avatarText}>{item.name[0]}</Text>
                </View>
                <View style={styles.nameCol}>
                    <Text style={styles.name} numberOfLines={1}>
                        {item.name}
                    </Text>
                    <Text style={styles.tier}>{item.tier}</Text>
                </View>
                <Text style={styles.score}>{item.score}</Text>
                {scope === 'friends' && (
                    <PressableScale
                        onPress={() => handleRemoveFriend(item.userId)}
                        disabled={mutating}
                        hitSlop={8}
                        accessibilityLabel={`Remove ${item.name}`}
                        style={styles.removeButton}
                    >
                        <Ionicons name="close" size={14} color={colors.textMuted} />
                    </PressableScale>
                )}
            </View>
        );
    }

    const emptyText = failed
        ? 'Leaderboard unavailable — check your connection.'
        : !wallet
          ? 'Connect your wallet to see the leaderboard.'
          : scope === 'friends'
            ? 'Add friends by wallet address to see them here.'
            : 'No entries yet. Check in daily to climb the ranks.';

    return (
        <Modal transparent visible={visible} animationType="slide">
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.overlay}
            >
                <View style={[styles.sheet, { maxHeight: windowHeight * 0.85 }]}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Leaderboard</Text>
                        <PressableScale onPress={onClose} accessibilityLabel="Close">
                            <Ionicons name="close" size={22} color={colors.textMuted} />
                        </PressableScale>
                    </View>

                    {wallet && (
                        <View style={styles.scopeRow}>
                            <PressableScale
                                onPress={() => setScope('global')}
                                style={[styles.scopeButton, scope === 'global' && styles.scopeActive]}
                            >
                                <Text
                                    style={[
                                        styles.scopeText,
                                        scope === 'global' && styles.scopeTextActive,
                                    ]}
                                >
                                    Global
                                </Text>
                            </PressableScale>
                            <PressableScale
                                onPress={() => setScope('friends')}
                                style={[styles.scopeButton, scope === 'friends' && styles.scopeActive]}
                            >
                                <Text
                                    style={[
                                        styles.scopeText,
                                        scope === 'friends' && styles.scopeTextActive,
                                    ]}
                                >
                                    Friends
                                </Text>
                            </PressableScale>
                        </View>
                    )}

                    {ownEntry && (
                        <View style={[styles.row, styles.rowOwn]}>
                            <Text style={styles.rank}>{ownRank ?? '–'}</Text>
                            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                                <Text style={[styles.avatarText, { color: colors.background }]}>
                                    Y
                                </Text>
                            </View>
                            {editingName ? (
                                <View style={styles.nameEditCol}>
                                    <TextInput
                                        value={nameDraft}
                                        onChangeText={setNameDraft}
                                        placeholder="Display name"
                                        placeholderTextColor={colors.textMuted}
                                        style={styles.nameInput}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        maxLength={DISPLAY_NAME_MAX + 1}
                                        autoFocus
                                    />
                                </View>
                            ) : (
                                <View style={styles.nameCol}>
                                    <Text style={styles.name}>You</Text>
                                    <Text style={styles.tier}>
                                        {ownEntry.tier}
                                        {data?.own?.displayName
                                            ? ` · ${data.own.displayName}`
                                            : ''}
                                    </Text>
                                </View>
                            )}
                            <Text style={styles.score}>{ownEntry.score}</Text>
                            {editingName ? (
                                <View style={styles.nameEditActions}>
                                    <PressableScale
                                        onPress={handleSaveName}
                                        disabled={mutating}
                                        hitSlop={8}
                                        accessibilityLabel="Save name"
                                    >
                                        {mutating ? (
                                            <ActivityIndicator
                                                size="small"
                                                color={colors.primary}
                                            />
                                        ) : (
                                            <Ionicons
                                                name="checkmark"
                                                size={18}
                                                color={colors.primary}
                                            />
                                        )}
                                    </PressableScale>
                                    <PressableScale
                                        onPress={() => {
                                            setEditingName(false);
                                            setNameError(null);
                                        }}
                                        hitSlop={8}
                                        accessibilityLabel="Cancel"
                                    >
                                        <Ionicons
                                            name="close"
                                            size={18}
                                            color={colors.textMuted}
                                        />
                                    </PressableScale>
                                </View>
                            ) : (
                                <PressableScale
                                    onPress={() => {
                                        setNameDraft(data?.own?.displayName ?? '');
                                        setNameError(null);
                                        setEditingName(true);
                                    }}
                                    hitSlop={8}
                                    accessibilityLabel="Edit display name"
                                >
                                    <Ionicons
                                        name="pencil-outline"
                                        size={16}
                                        color={colors.textMuted}
                                    />
                                </PressableScale>
                            )}
                        </View>
                    )}
                    {nameError && <Text style={styles.fieldError}>{nameError}</Text>}

                    <FlatList
                        data={entries}
                        keyExtractor={(item) => item.userId}
                        renderItem={renderRow}
                        style={styles.list}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        ListEmptyComponent={
                            <Text style={styles.emptyText}>{emptyText}</Text>
                        }
                        ListFooterComponent={
                            scope === 'friends' && wallet && !failed ? (
                                <View>
                                    <View style={styles.addFriendRow}>
                                        <TextInput
                                            value={friendDraft}
                                            onChangeText={setFriendDraft}
                                            placeholder="Friend's wallet address"
                                            placeholderTextColor={colors.textMuted}
                                            style={styles.addFriendInput}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                        />
                                        <PressableScale
                                            onPress={handleAddFriend}
                                            disabled={mutating}
                                            style={styles.addFriendButton}
                                            accessibilityLabel="Add friend"
                                        >
                                            {mutating ? (
                                                <ActivityIndicator
                                                    size="small"
                                                    color={colors.background}
                                                />
                                            ) : (
                                                <Ionicons
                                                    name="add"
                                                    size={18}
                                                    color={colors.background}
                                                />
                                            )}
                                        </PressableScale>
                                    </View>
                                    {friendError && (
                                        <Text style={styles.fieldError}>
                                            {friendError}
                                        </Text>
                                    )}
                                </View>
                            ) : null
                        }
                    />
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(2,6,12,0.72)',
    },
    sheet: {
        padding: spacing.md,
        paddingBottom: 32,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        backgroundColor: colors.surface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    title: {
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.text,
    },
    scopeRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    scopeButton: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    scopeActive: {
        backgroundColor: colors.primary,
    },
    scopeText: {
        fontSize: typography.small,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.textMuted,
    },
    scopeTextActive: {
        color: colors.background,
    },
    list: {
        flexGrow: 0,
        flexShrink: 1,
    },
    listContent: {
        gap: 8,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    rowOwn: {
        borderWidth: 1,
        borderColor: colors.primary,
        marginBottom: 8,
    },
    emptyText: {
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        color: colors.textMuted,
        textAlign: 'center',
        paddingVertical: spacing.md,
    },
    rank: {
        width: 28,
        fontSize: typography.body,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.textMuted,
        textAlign: 'center',
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: typography.body,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.text,
    },
    nameCol: {
        flex: 1,
    },
    nameEditCol: {
        flex: 1,
    },
    nameEditActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    nameInput: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        borderBottomWidth: 1,
        borderBottomColor: colors.primary,
        paddingVertical: 4,
    },
    name: {
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
        color: colors.text,
    },
    tier: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: colors.textMuted,
    },
    score: {
        fontSize: typography.small,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.text,
    },
    removeButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceLight,
    },
    addFriendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginTop: 8,
    },
    addFriendInput: {
        flex: 1,
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: radius.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    addFriendButton: {
        width: 36,
        height: 36,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
    },
    fieldError: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: colors.danger,
        marginTop: 6,
    },
});
