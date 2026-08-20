import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { PetCanvas } from '../../src/components/PetCanvas';
import { Slidebar } from '../../src/components/Slidebar';
import EvolutionCeremony from '../../src/components/EvolutionCeremony';
import CosmeticsSheet from '../../src/components/CosmeticsSheet';
import QuestsSheet from '../../src/components/QuestsSheet';
import WaitlistSheet from '../../src/components/WaitlistSheet';
import { useCheckinStore } from '../../src/features/checkin/store';
import {
  ACCESSORY_EMOJI,
  BACKGROUND_COLORS,
  STAGE_NAMES,
  STAGE_THRESHOLDS,
  usePetStore,
} from '../../src/features/pet/store';
import { useWalletStore } from '../../src/features/wallet/store';
import { colors } from '../../src/theme/tokens';
import type { PetMood, PetReaction } from '../../src/components/PetCanvas';

function getMood(
  hour: number,
  hasCheckedInToday: boolean,
  streak: number
): PetMood {
  if (hour >= 22 || hour <= 7) {
    return 'sleeping';
  }

  if (hasCheckedInToday) {
    if (streak >= 7) {
      return 'proud';
    }
    return 'happy';
  }

  return 'waiting';
}

function computeProgressPercent(streak: number, stage: number): number {
  if (stage >= STAGE_THRESHOLDS.length) {
    return 100;
  }

  const currentThreshold = STAGE_THRESHOLDS[stage - 1] ?? 0;
  const nextThreshold = STAGE_THRESHOLDS[stage] ?? currentThreshold + 1;
  const range = nextThreshold - currentThreshold;

  if (range <= 0) return 100;

  return Math.min(((streak - currentThreshold) / range) * 100, 100);
}

function pickReaction(): PetReaction {
  const rand = Math.random();

  if (rand < 0.1) return 'dance';
  if (rand < 0.4) return 'jump';
  if (rand < 0.7) return 'spin';
  return 'glow';
}

function formatNumber(num: number): string {
  return Math.round(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const currentHour = now.getHours();

  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [cosmeticsVisible, setCosmeticsVisible] = useState(false);
  const [questsVisible, setQuestsVisible] = useState(false);
  const [waitlistVisible, setWaitlistVisible] = useState(false);
  const [reaction, setReaction] = useState<PetReaction | undefined>(undefined);
  const [timeLeft, setTimeLeft] = useState('');

  const checkIn = useCheckinStore((state) => state.checkIn);
  const hasCheckedInToday = useCheckinStore((state) => state.hasCheckedInToday());
  const streak = useCheckinStore((state) => state.streak);
  const longestStreak = useCheckinStore((state) => state.longestStreak);
  const totalCheckins = useCheckinStore((state) => state.totalCheckins);

  const stage = usePetStore((state) => state.stage);
  const petName = usePetStore((state) => state.name);
  const background = usePetStore((state) => state.background);
  const accessory = usePetStore((state) => state.accessory);
  const lastCelebratedStage = usePetStore((state) => state.lastCelebratedStage);
  const setLastCelebratedStage = usePetStore(
    (state) => state.setLastCelebratedStage
  );

  const walletAddress = useWalletStore((state) => state.address);

  const horizontalPadding = Math.min(Math.max(width * 0.05, 16), 24);
  const isSmallDevice = width < 360;
  const isTinyDevice = width < 330;
  const scale = Math.min(Math.max(width / 375, 0.9), 1.1);

  const isDoneToday = hasCheckedInToday;

  const mood = useMemo(
    () => getMood(currentHour, isDoneToday, streak),
    [currentHour, isDoneToday, streak]
  );

  const progressPercent = useMemo(
    () => computeProgressPercent(streak, stage),
    [streak, stage]
  );

  const showEvolution = stage > lastCelebratedStage;

  const points = useMemo(
    () => streak * 12500 + totalCheckins * 350,
    [streak, totalCheckins]
  );
  const fp = useMemo(
    () => totalCheckins * 12.5 + streak * 45,
    [totalCheckins, streak]
  );

  const attack = streak * 13 + totalCheckins;
  const defense = longestStreak * 7 + stage * 10;

  const xp = totalCheckins * 420;
  const nextLevelXp = (stage + 1) * 5000;

  useEffect(() => {
    const update = () => {
      const today = new Date();
      const midnight = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 1
      );
      setTimeLeft(formatCountdown(midnight.getTime() - today.getTime()));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  function handleFeed() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!isDoneToday) {
      const result = checkIn(true);
      if (result.success) {
        setReaction(pickReaction());
      }
    } else {
      setReaction(pickReaction());
      Alert.alert('Already fed', `${petName || 'Finny'} is happy and full.`);
    }
  }

  function handlePhoto() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReaction('dance');
    Alert.alert('Photo', 'Share your creature coming soon!');
  }

  function handleNudge() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Nudge', 'Send a nudge to a friend coming soon!');
  }

  function handleCosmetics() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCosmeticsVisible(true);
  }

  function handleHardware() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWaitlistVisible(true);
  }

  const displayName = petName || 'Finny';
  const walletLabel = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : displayName;

  return (
    <View
      style={[
        styles.safe,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.container,
          {
            paddingHorizontal: horizontalPadding,
          },
        ]}
      >
        {/* TOP BAR */}
        <View style={[styles.topBar, isTinyDevice && styles.topBarWrap]}>
          <Pressable
            style={({ pressed }) => [
              styles.walletDropdown,
              isTinyDevice && styles.walletDropdownSmall,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="wallet-outline"
              size={isTinyDevice ? 14 : 16}
              color={colors.text}
            />
            <Text
              style={[
                styles.walletLabel,
                isTinyDevice && styles.walletLabelSmall,
              ]}
              numberOfLines={1}
            >
              {walletLabel}
            </Text>
            <Ionicons
              name="chevron-down"
              size={isTinyDevice ? 12 : 14}
              color={colors.textMuted}
            />
          </Pressable>

          <View style={styles.topBarRight}>
            <View style={[styles.currencyChip, isTinyDevice && styles.currencyChipSmall]}>
              <Ionicons name="nutrition-outline" size={isTinyDevice ? 12 : 14} color={colors.text} />
              <Text style={[styles.currencyValue, isTinyDevice && styles.currencyValueSmall]}>
                {formatNumber(points)}
              </Text>
            </View>

            {/* <View style={[styles.currencyChip, isTinyDevice && styles.currencyChipSmall]}>
              <Ionicons name="flash-outline" size={isTinyDevice ? 12 : 14} color={colors.primary} />
              <Text style={[styles.currencyValue, isTinyDevice && styles.currencyValueSmall]}>
                {fp.toFixed(3)}
              </Text>
              <Text style={[styles.currencySymbol, isTinyDevice && styles.currencySymbolSmall]}>$FNG</Text>
            </View> */}

            <Pressable
              onPress={() => setSidebarVisible(true)}
              hitSlop={8}
              style={({ pressed }) => [
                styles.menuButton,
                isTinyDevice && styles.menuButtonSmall,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="menu" size={isTinyDevice ? 16 : 18} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {/* POINTS ROW */}
        <View style={styles.pointsRow}>
          <View style={styles.pointsMain}>
            <Text
              style={[
                styles.pointsValue,
                isSmallDevice && styles.pointsValueSmall,
              ]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {formatNumber(points)}
            </Text>
            <Text style={styles.pointsLabel}>points</Text>
          </View>

        </View>

        {/* PET CARD */}
        <View style={styles.petCard}>
          <View style={styles.petCardHeader}>
            <View style={styles.timerPill}>
              <Ionicons name="heart" size={12} color="#FF8E9E" />
              <Text style={styles.timerText}>{timeLeft}</Text>
            </View>

            <Pressable
              onPress={handleNudge}
              style={({ pressed }) => [
                styles.iconButtonSmall,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="hand-left-outline" size={16} color={colors.text} />
            </Pressable>

            <View style={styles.spacer} />

            <Pressable
              onPress={handlePhoto}
              style={({ pressed }) => [
                styles.secondaryButtonSmall,
                isTinyDevice && styles.secondaryButtonSmallTiny,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="camera-outline" size={isTinyDevice ? 12 : 14} color={colors.text} />
              <Text style={styles.secondaryButtonText} numberOfLines={1}>Photo</Text>
            </Pressable>

            <Pressable
              onPress={handleFeed}
              style={({ pressed }) => [
                styles.primaryButtonSmall,
                isTinyDevice && styles.primaryButtonSmallTiny,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="nutrition-outline" size={isTinyDevice ? 12 : 14} color={colors.background} />
              <Text style={styles.primaryButtonText} numberOfLines={1}>Feed</Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.scene,
              { backgroundColor: BACKGROUND_COLORS[background][0] },
            ]}
          >
            <View
              style={[
                styles.sky,
                { backgroundColor: BACKGROUND_COLORS[background][1] },
              ]}
            />
            <View style={styles.ground} />
            <View style={styles.petWrap}>
              <PetCanvas mood={mood} reaction={reaction} />
              {accessory !== 'none' && (
                <Text style={styles.accessory}>
                  {ACCESSORY_EMOJI[accessory]}
                </Text>
              )}
            </View>
            {(mood === 'happy' || mood === 'proud') && (
              <Text style={styles.floatingHeart}>❤️</Text>
            )}
          </View>

          <View style={styles.petCardFooter}>
            <View style={styles.battleStat}>
              <Ionicons name="fitness-outline" size={14} color={colors.text} />
              <Text style={styles.battleStatText}>{attack}</Text>
            </View>
            <View style={styles.battleStat}>
              <Ionicons name="shield-outline" size={14} color={colors.text} />
              <Text style={styles.battleStatText}>{defense}</Text>
            </View>
          </View>
        </View>

        {/* STATS GRID */}
        <View style={styles.statsGrid}>
          <View style={styles.statTile}>
            <Ionicons name="fitness-outline" size={20} color={colors.textMuted} />
            <Text style={styles.statTileValue}>
              {formatNumber(Math.min(xp, nextLevelXp))}
              <Text style={styles.statTileMax}>/{formatNumber(nextLevelXp)}</Text>
            </Text>
          </View>

          <View style={styles.statTile}>
            <Ionicons name="star-outline" size={20} color={colors.textMuted} />
            <Text style={styles.statTileValue}>{stage}</Text>
          </View>

          <View style={styles.statTile}>
            <Ionicons name="timer-outline" size={20} color={colors.textMuted} />
            <Text style={styles.statTileValue}>{streak}</Text>
          </View>
        </View>

        {/* ACTION GRID */}
        <View style={styles.actionGrid}>
          <Pressable
            onPress={handleCosmetics}
            style={({ pressed }) => [
              styles.actionTile,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="color-palette-outline"
              size={22}
              color={colors.text}
            />
            <Text style={styles.actionTileText}>Cosmetics</Text>
          </Pressable>


          <Pressable
            onPress={handleHardware}
            style={({ pressed }) => [
              styles.actionTile,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="hardware-chip-outline" size={22} color={colors.text} />
            <Text style={styles.actionTileText}>Hardware</Text>
          </Pressable>
        </View>

        {/* PROGRESS STRIP */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>{displayName}'s evolution</Text>
            <Text style={styles.progressPercent}>
              {Math.round(progressPercent)}%
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressPercent}%` },
              ]}
            />
          </View>
          <Text style={styles.progressStage}>
            {STAGE_NAMES[stage] ?? STAGE_NAMES[1]}
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <Slidebar
        visible={sidebarVisible}
        onOpen={() => setSidebarVisible(true)}
        onClose={() => setSidebarVisible(false)}
        onOpenQuests={() => setQuestsVisible(true)}
        onOpenWaitlist={() => setWaitlistVisible(true)}
      />

      <EvolutionCeremony
        visible={showEvolution}
        stage={stage}
        petName={petName}
        onDismiss={() => setLastCelebratedStage(stage)}
      />

      <CosmeticsSheet
        visible={cosmeticsVisible}
        onClose={() => setCosmeticsVisible(false)}
      />

      <QuestsSheet
        visible={questsVisible}
        onClose={() => setQuestsVisible(false)}
      />

      <WaitlistSheet
        visible={waitlistVisible}
        onClose={() => setWaitlistVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingTop: 12,
    paddingBottom: 20,
  },

  /* TOP BAR */
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    gap: 8,
  },
  topBarWrap: {
    flexWrap: 'wrap',
  },
  walletDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  walletDropdownSmall: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 4,
  },
  walletLabel: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
    maxWidth: 90,
  },
  walletLabelSmall: {
    fontSize: 11,
    maxWidth: 60,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  currencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  currencyChipSmall: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    gap: 2,
  },
  currencyValue: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
  },
  currencyValueSmall: {
    fontSize: 10,
  },
  currencySymbol: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
  },
  currencySymbolSmall: {
    fontSize: 9,
  },
  menuButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  menuButtonSmall: {
    width: 32,
    height: 32,
  },

  /* POINTS */
  pointsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    gap: 10,
  },
  pointsMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    minWidth: 0,
  },
  pointsValue: {
    color: colors.text,
    fontSize: 32,
    fontFamily: 'Poppins_800ExtraBold',
  },
  pointsValueSmall: {
    fontSize: 26,
  },
  pointsLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  rewardsPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(93,226,166,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(93,226,166,0.20)',
  },
  rewardsText: {
    color: colors.primary,
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
  },

  /* PET CARD */
  petCard: {
    width: '100%',
    padding: 14,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  petCardHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  timerText: {
    color: colors.text,
    fontSize: 11,
    fontFamily: 'Poppins_700Bold',
  },
  iconButtonSmall: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  spacer: {
    flex: 1,
  },
  secondaryButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  secondaryButtonSmallTiny: {
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
  },
  primaryButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  primaryButtonSmallTiny: {
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
  },
  scene: {
    width: '100%',
    minHeight: 220,
    maxHeight: 360,
    aspectRatio: 1.25,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '65%',
    opacity: 0.7,
  },
  ground: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '28%',
    backgroundColor: 'rgba(93,226,166,0.12)',
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
  },
  petWrap: {
    zIndex: 2,
  },
  accessory: {
    position: 'absolute',
    top: -8,
    right: -10,
    fontSize: 28,
    zIndex: 4,
  },
  floatingHeart: {
    position: 'absolute',
    top: 20,
    right: 24,
    fontSize: 24,
    zIndex: 3,
  },
  petCardFooter: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  battleStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  battleStatText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
  },

  /* STATS GRID */
  statsGrid: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  statTile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statTileValue: {
    color: colors.text,
    fontSize: 15,
    fontFamily: 'Poppins_800ExtraBold',
  },
  statTileMax: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },

  /* ACTION GRID */
  actionGrid: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionTile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  actionTileText: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
  },

  /* PROGRESS */
  progressCard: {
    width: '100%',
    marginTop: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  progressHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressTitle: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
  },
  progressPercent: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: 'Poppins_800ExtraBold',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  progressStage: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'Poppins_500Medium',
  },

  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
});
