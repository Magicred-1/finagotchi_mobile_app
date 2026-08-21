import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
  useWindowDimensions,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  runOnJS,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { PetCanvas } from '../../src/components/PetCanvas';
import { PressableScale } from '../../src/components/PressableScale';
import { Sidebar, SIDEBAR_WIDTH } from '../../src/components/Sidebar';
import EvolutionCeremony from '../../src/components/EvolutionCeremony';
import CollectiblesSheet from '../../src/components/CollectiblesSheet';
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
import { colors, radius, spacing, springs, tracking, typography } from '../../src/theme/tokens';
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

function project(initialVelocity: number, decelerationRate = 0.998) {
  'worklet';
  return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate);
}

type PetAction = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  cost: number;
  reaction: PetReaction;
};

const PET_ACTIONS: PetAction[] = [
  { id: 'caress', icon: 'hand-left-outline', label: 'Caress', cost: 0, reaction: 'jump' },
  { id: 'treat', icon: 'nutrition-outline', label: 'Treat', cost: 50, reaction: 'glow' },
  { id: 'play', icon: 'game-controller-outline', label: 'Play', cost: 100, reaction: 'dance' },
  { id: 'train', icon: 'barbell-outline', label: 'Train', cost: 250, reaction: 'spin' },
];

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const currentHour = now.getHours();

  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [collectiblesVisible, setCollectiblesVisible] = useState(false);
  const [questsVisible, setQuestsVisible] = useState(false);
  const [waitlistVisible, setWaitlistVisible] = useState(false);
  const [reaction, setReaction] = useState<PetReaction | undefined>(undefined);
  const [timeLeft, setTimeLeft] = useState('');
  const [exitToastVisible, setExitToastVisible] = useState(false);

  const lastBackPress = useRef(0);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sidebarTranslateX = useSharedValue(-SIDEBAR_WIDTH);
  const sidebarOpacity = useSharedValue(0);
  const exitToastOpacity = useSharedValue(0);

  const openSidebarPan = Gesture.Pan()
    .enabled(!sidebarVisible)
    .activeOffsetX([20, 9999])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      const x = Math.max(0, event.translationX);
      sidebarTranslateX.value = Math.min(0, -SIDEBAR_WIDTH + x);
      sidebarOpacity.value = Math.min(1, x / SIDEBAR_WIDTH);
    })
    .onEnd((event) => {
      const projectedX = event.translationX + (event.velocityX / 1000) * 0.998 / (1 - 0.998);
      const shouldOpen =
        projectedX > 60 || event.translationX > SIDEBAR_WIDTH * 0.3;

      if (shouldOpen) {
        runOnJS(setSidebarVisible)(true);
      } else {
        sidebarTranslateX.value = withSpring(-SIDEBAR_WIDTH, springs.default);
        sidebarOpacity.value = withTiming(0, { duration: 200 });
      }
    });

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
  const balance = usePetStore((state) => state.balance);
  const spendBalance = usePetStore((state) => state.spendBalance);

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

  // Double-tap back to exit, with visual feedback. Close any open sheet/sidebar first.
  useEffect(() => {
    const onBackPress = () => {
      if (sidebarVisible) {
        setSidebarVisible(false);
        return true;
      }
      if (collectiblesVisible) {
        setCollectiblesVisible(false);
        return true;
      }
      if (questsVisible) {
        setQuestsVisible(false);
        return true;
      }
      if (waitlistVisible) {
        setWaitlistVisible(false);
        return true;
      }
      if (showEvolution) {
        setLastCelebratedStage(stage);
        return true;
      }

      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        return false; // allow exit
      }

      lastBackPress.current = now;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (ToastAndroid) {
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      }
      setExitToastVisible(true);
      exitToastOpacity.value = withTiming(1, { duration: 200 });
      if (toastTimeout.current) {
        clearTimeout(toastTimeout.current);
      }
      toastTimeout.current = setTimeout(() => {
        exitToastOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
          if (finished) {
            runOnJS(setExitToastVisible)(false);
          }
        });
      }, 2000);
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [sidebarVisible, collectiblesVisible, questsVisible, waitlistVisible, showEvolution, stage]);

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

  function handleCollectibles() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCollectiblesVisible(true);
  }

  function handleHardware() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWaitlistVisible(true);
  }

  function handleGames() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Games', 'Mini-games for your Finagotchi are coming soon!');
  }

  function handlePetAction(action: PetAction) {
    const success = spendBalance(action.cost);
    if (!success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReaction(action.reaction);
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
          <PressableScale
            style={[
              styles.walletDropdown,
              isTinyDevice && styles.walletDropdownSmall,
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
          </PressableScale>

          <View style={styles.topBarRight}>
            <PressableScale
              onPress={() => setSidebarVisible(true)}
              hitSlop={8}
              style={[
                styles.menuButton,
                isTinyDevice && styles.menuButtonSmall,
              ]}
            >
              <Ionicons name="menu" size={isTinyDevice ? 16 : 18} color={colors.text} />
            </PressableScale>
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

          <View style={styles.balancePill}>
            <Ionicons name="wallet-outline" size={12} color={colors.warning} />
            <Text style={styles.balanceText}>{formatNumber(balance)}</Text>
          </View>
        </View>

        {/* PET CARD */}
        <View style={styles.petCard}>
          <View style={styles.petCardHeader}>
            <View style={styles.timerPill}>
              <Ionicons name="heart" size={12} color="#FF8E9E" />
              <Text style={styles.timerText}>{timeLeft}</Text>
            </View>

            <PressableScale
              onPress={handleNudge}
              style={styles.iconButtonSmall}
            >
              <Ionicons name="hand-left-outline" size={16} color={colors.text} />
            </PressableScale>

            <View style={styles.spacer} />

            <PressableScale
              onPress={handlePhoto}
              style={[
                styles.secondaryButtonSmall,
                isTinyDevice && styles.secondaryButtonSmallTiny,
              ]}
            >
              <Ionicons name="camera-outline" size={isTinyDevice ? 12 : 14} color={colors.text} />
              <Text style={styles.secondaryButtonText} numberOfLines={1}>Photo</Text>
            </PressableScale>

            <PressableScale
              onPress={handleFeed}
              style={[
                styles.primaryButtonSmall,
                isTinyDevice && styles.primaryButtonSmallTiny,
              ]}
            >
              <Ionicons name="nutrition-outline" size={isTinyDevice ? 12 : 14} color={colors.background} />
              <Text style={styles.primaryButtonText} numberOfLines={1}>Feed</Text>
            </PressableScale>
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

          <View style={styles.petActionsRow}>
            {PET_ACTIONS.map((action) => {
              const canAfford = balance >= action.cost;
              return (
                <PressableScale
                  key={action.id}
                  onPress={() => handlePetAction(action)}
                  disabled={!canAfford}
                  style={[
                    styles.petActionButton,
                    !canAfford && styles.petActionButtonDisabled,
                  ]}
                >
                  <Ionicons
                    name={action.icon}
                    size={18}
                    color={canAfford ? colors.text : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.petActionLabel,
                      !canAfford && styles.petActionLabelDisabled,
                    ]}
                    numberOfLines={1}
                  >
                    {action.label}
                  </Text>
                  <View
                    style={[
                      styles.petActionPricePill,
                      action.cost === 0 && styles.petActionPricePillFree,
                      !canAfford && styles.petActionPricePillDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.petActionPriceText,
                        action.cost === 0 && styles.petActionPriceTextFree,
                        !canAfford && styles.petActionPriceTextDisabled,
                      ]}
                    >
                      {action.cost === 0 ? 'Free' : formatNumber(action.cost)}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
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
          <PressableScale
            onPress={handleCollectibles}
            style={styles.actionTile}
          >
            <Ionicons
              name="color-palette-outline"
              size={22}
              color={colors.text}
            />
            <Text style={styles.actionTileText}>Collectibles</Text>
          </PressableScale>


          <PressableScale
            onPress={handleHardware}
            style={styles.actionTile}
          >
            <Ionicons name="hardware-chip-outline" size={22} color={colors.text} />
            <Text style={styles.actionTileText}>Hardware</Text>
          </PressableScale>

          <PressableScale
            onPress={handleGames}
            style={[styles.actionTile, styles.actionTileMuted]}
          >
            <Ionicons name="game-controller-outline" size={22} color={colors.textMuted} />
            <Text style={[styles.actionTileText, styles.actionTileTextMuted]}>Games</Text>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Soon</Text>
            </View>
          </PressableScale>
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

      {!sidebarVisible && (
        <GestureDetector gesture={openSidebarPan}>
          <View style={[styles.edgeStrip, { top: insets.top, bottom: insets.bottom }]} />
        </GestureDetector>
      )}

      <Sidebar
        visible={sidebarVisible}
        onOpen={() => setSidebarVisible(true)}
        onClose={() => setSidebarVisible(false)}
        onOpenQuests={() => setQuestsVisible(true)}
        onOpenWaitlist={() => setWaitlistVisible(true)}
        translateX={sidebarTranslateX}
        opacity={sidebarOpacity}
      />

      <EvolutionCeremony
        visible={showEvolution}
        stage={stage}
        petName={petName}
        onDismiss={() => setLastCelebratedStage(stage)}
      />

      <CollectiblesSheet
        visible={collectiblesVisible}
        onClose={() => setCollectiblesVisible(false)}
      />

      <QuestsSheet
        visible={questsVisible}
        onClose={() => setQuestsVisible(false)}
      />

      <WaitlistSheet
        visible={waitlistVisible}
        onClose={() => setWaitlistVisible(false)}
      />

      {exitToastVisible && (
        <Animated.View
          style={[
            styles.exitToast,
            { opacity: exitToastOpacity },
            { bottom: Math.max(insets.bottom, 16) + 16 },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.exitToastText}>Press back again to exit</Text>
        </Animated.View>
      )}
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
  edgeStrip: {
    position: 'absolute',
    left: 0,
    width: 20,
    backgroundColor: 'transparent',
    zIndex: 50,
  },
  exitToast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,27,46,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    zIndex: 3000,
  },
  exitToastText: {
    color: colors.text,
    fontSize: typography.small,
    fontFamily: 'Poppins_600SemiBold',
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
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  pointsValue: {
    color: colors.text,
    fontSize: 32,
    fontFamily: 'Poppins_800ExtraBold',
    letterSpacing: tracking.title * 32,
  },
  pointsValueSmall: {
    fontSize: 26,
    letterSpacing: tracking.title * 26,
  },
  pointsLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(255,209,102,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,209,102,0.20)',
  },
  balanceText: {
    color: colors.warning,
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
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

  /* PET ACTIONS */
  petActionsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  petActionButton: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  petActionButtonDisabled: {
    backgroundColor: 'rgba(14,27,46,0.50)',
    borderColor: 'rgba(255,255,255,0.04)',
  },
  petActionLabel: {
    color: colors.text,
    fontSize: 11,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
  },
  petActionLabelDisabled: {
    color: colors.textMuted,
  },
  petActionPricePill: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  petActionPricePillFree: {
    backgroundColor: 'rgba(93,226,166,0.12)',
  },
  petActionPricePillDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  petActionPriceText: {
    color: colors.text,
    fontSize: 9,
    fontFamily: 'Poppins_800ExtraBold',
  },
  petActionPriceTextFree: {
    color: colors.primary,
  },
  petActionPriceTextDisabled: {
    color: colors.textMuted,
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
  actionTileMuted: {
    backgroundColor: 'rgba(14,27,46,0.60)',
    borderColor: 'rgba(255,255,255,0.04)',
  },
  actionTileTextMuted: {
    color: colors.textMuted,
  },
  comingSoonBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  comingSoonText: {
    color: colors.textMuted,
    fontSize: 8,
    fontFamily: 'Poppins_800ExtraBold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
    letterSpacing: tracking.small * 13,
  },
  progressPercent: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: 'Poppins_800ExtraBold',
    letterSpacing: tracking.small * 13,
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
});
