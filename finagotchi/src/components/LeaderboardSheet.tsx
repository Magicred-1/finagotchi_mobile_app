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
    searchUsers,
    setProfileUsername,
    USERNAME_REGEX,
    type DbsLeaderboardEntry,
    type DbsLeaderboardResponse,
} from '../features/dbs/client';
import { useWalletStore } from '../features/wallet/store';
import { dynamicClient } from '../wallet/dynamicClient';

interface Props {
    visible: boolean;
    onClose: () => void;
}

/** Server-side username limit (POST /dbs/profile 400s beyond it). */
const USERNAME_MAX = 24;

function shortWallet(wallet: string): string {
    return wallet.slice(0, 4) + '...' + wallet.slice(-4);
}

function toEntry(entry: DbsLeaderboardEntry): LeaderboardEntry {
    return {
        userId: entry.wallet,
        name: entry.username || entry.displayName || shortWallet(entry.wallet),
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

    const [editingUsername, setEditingUsername] = useState(false);
    const [usernameDraft, setUsernameDraft] = useState('');
    const [usernameError, setUsernameError] = useState<string | null>(null);

    const [friendDraft, setFriendDraft] = useState('');
    const [friendError, setFriendError] = useState<string | null>(null);
    // Nickname search results; null = no active search. The friends list is
    // never cleared while searching — results render above it.
    const [searchResults, setSearchResults] = useState<
        { wallet: string; displayName: string }[] | null
    >(null);
    const [searching, setSearching] = useState(false);

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
        setEditingUsername(false);
        setUsernameError(null);
        setFriendDraft('');
        setFriendError(null);
        setSearchResults(null);
        setSearching(false);
    }, [visible]);

    const trimmedQuery = friendDraft.trim();
    // A valid base58 address skips search entirely — it can be added directly.
    const queryIsAddress = isValidSolanaAddress(trimmedQuery);

    // Debounced nickname search (≥2 chars; the server 400s below that).
    useEffect(() => {
        if (!wallet || trimmedQuery.length < 2 || queryIsAddress) {
            setSearchResults(null);
            setSearching(false);
            return;
        }
        let cancelled = false;
        setSearching(true);
        const timer = setTimeout(() => {
            void searchUsers(wallet, trimmedQuery)
                .then((res) => {
                    if (cancelled) return;
                    setSearchResults(res);
                    setFriendError(null);
                    setSearching(false);
                })
                .catch(() => {
                    if (cancelled) return;
                    setSearchResults(null);
                    setFriendError('Search failed — try again.');
                    setSearching(false);
                });
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trimmedQuery, queryIsAddress, wallet]);

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

    function handleEditUsername() {
        // Prefill from the server row; for Dynamic sessions fall back to the
        // Dynamic profile username. Read lazily (non-reactive) on press.
        const own = data?.own?.username;
        const draft =
            own ||
            (useWalletStore.getState().session.connectionType === 'dynamic'
                ? (dynamicClient.auth.authenticatedUser?.username ?? '')
                : '');
        setUsernameDraft(draft);
        setUsernameError(null);
        setEditingUsername(true);
    }

    async function handleSaveUsername() {
        if (!wallet) return;
        const username = usernameDraft.trim();
        // '' clears the username server-side; anything else must match.
        if (username !== '' && !USERNAME_REGEX.test(username)) {
            setUsernameError('3–24 characters: letters, numbers, _ or -');
            return;
        }
        setMutating(true);
        setUsernameError(null);
        try {
            await setProfileUsername(wallet, username);
            // The server is authoritative for the leaderboard; syncing the
            // Dynamic profile is best-effort and only works over the Dynamic
            // WebView transport.
            if (useWalletStore.getState().session.connectionType === 'dynamic') {
                try {
                    await dynamicClient.auth.updateUser({
                        username: username === '' ? null : username,
                    });
                } catch (e) {
                    console.warn('Dynamic username sync failed', e);
                }
            }
            await reload();
            setEditingUsername(false);
        } catch (e) {
            const status = (e as { status?: number }).status;
            setUsernameError(
                status === 409
                    ? 'That username is taken.'
                    : status === 400
                      ? '3–24 characters: letters, numbers, _ or -'
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
        await addFriendAndReload(friendWallet);
    }

    // Add from a search-result row or the direct-address row.
    async function addFriendAndReload(friendWallet: string) {
        if (!wallet) return;
        setMutating(true);
        setFriendError(null);
        try {
            await addFriend(wallet, friendWallet);
            setFriendDraft('');
            setSearchResults(null);
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
            ? 'Search by nickname to add friends to your board.'
            : 'No entries yet. Check in daily to climb the ranks.';

    const addFriendFooter =
        scope === 'friends' && wallet && !failed ? (
            <View>
                <View style={styles.addFriendRow}>
                    <Ionicons
                        name="search"
                        size={16}
                        color={colors.textMuted}
                        style={styles.searchIcon}
                    />
                    <TextInput
                        value={friendDraft}
                        onChangeText={setFriendDraft}
                        placeholder="Search by nickname or paste an address…"
                        placeholderTextColor={colors.textMuted}
                        style={styles.addFriendInput}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>

                {trimmedQuery.length >= 2 && (
                    <View style={styles.searchResults}>
                        {queryIsAddress ? (
                            <View style={styles.row}>
                                <View
                                    style={[
                                        styles.avatar,
                                        { backgroundColor: colors.surfaceLight },
                                    ]}
                                >
                                    <Ionicons
                                        name="wallet-outline"
                                        size={16}
                                        color={colors.textMuted}
                                    />
                                </View>
                                <View style={styles.nameCol}>
                                    <Text style={styles.name} numberOfLines={1}>
                                        Add {shortWallet(trimmedQuery)}
                                    </Text>
                                    <Text style={styles.tier}>
                                        Wallet address
                                    </Text>
                                </View>
                                <PressableScale
                                    onPress={handleAddFriend}
                                    disabled={mutating}
                                    style={styles.addFriendButton}
                                    accessibilityLabel={`Add ${shortWallet(trimmedQuery)}`}
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
                        ) : searching ? (
                            <Text style={styles.searchHint}>Searching…</Text>
                        ) : searchResults && searchResults.length > 0 ? (
                            searchResults.map((result) => (
                                <View key={result.wallet} style={styles.row}>
                                    <View
                                        style={[
                                            styles.avatar,
                                            {
                                                backgroundColor:
                                                    colors.surfaceLight,
                                            },
                                        ]}
                                    >
                                        <Text style={styles.avatarText}>
                                            {(
                                                result.displayName ||
                                                shortWallet(result.wallet)
                                            )[0].toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={styles.nameCol}>
                                        <Text
                                            style={styles.name}
                                            numberOfLines={1}
                                        >
                                            {result.displayName ||
                                                shortWallet(result.wallet)}
                                        </Text>
                                        <Text style={styles.tier}>
                                            {shortWallet(result.wallet)}
                                        </Text>
                                    </View>
                                    <PressableScale
                                        onPress={() =>
                                            addFriendAndReload(result.wallet)
                                        }
                                        disabled={mutating}
                                        style={styles.addFriendButton}
                                        accessibilityLabel={`Add ${
                                            result.displayName ||
                                            shortWallet(result.wallet)
                                        }`}
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
                            ))
                        ) : searchResults ? (
                            <Text style={styles.searchHint}>
                                No one by that nickname.
                            </Text>
                        ) : null}
                    </View>
                )}

                {friendError && (
                    <Text style={styles.fieldError}>{friendError}</Text>
                )}
            </View>
        ) : null;

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
                            {editingUsername ? (
                                <View style={styles.nameEditCol}>
                                    <TextInput
                                        value={usernameDraft}
                                        onChangeText={setUsernameDraft}
                                        placeholder="Username"
                                        placeholderTextColor={colors.textMuted}
                                        style={styles.nameInput}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        maxLength={USERNAME_MAX}
                                        autoFocus
                                    />
                                </View>
                            ) : (
                                <View style={styles.nameCol}>
                                    <Text style={styles.name}>You</Text>
                                    <Text style={styles.tier}>
                                        {ownEntry.tier}
                                        {data?.own?.username
                                            ? ` · @${data.own.username}`
                                            : ''}
                                    </Text>
                                </View>
                            )}
                            <Text style={styles.score}>{ownEntry.score}</Text>
                            {editingUsername ? (
                                <View style={styles.nameEditActions}>
                                    <PressableScale
                                        onPress={handleSaveUsername}
                                        disabled={mutating}
                                        hitSlop={8}
                                        accessibilityLabel="Save username"
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
                                            setEditingUsername(false);
                                            setUsernameError(null);
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
                                    onPress={handleEditUsername}
                                    hitSlop={8}
                                    accessibilityLabel="Edit username"
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
                    {usernameError && <Text style={styles.fieldError}>{usernameError}</Text>}

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
                        ListFooterComponent={addFriendFooter}
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
    searchIcon: {
        marginLeft: spacing.xs,
    },
    searchResults: {
        gap: 8,
        marginTop: 8,
    },
    searchHint: {
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        color: colors.textMuted,
        paddingVertical: spacing.xs,
    },
    fieldError: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: colors.danger,
        marginTop: 6,
    },
});
