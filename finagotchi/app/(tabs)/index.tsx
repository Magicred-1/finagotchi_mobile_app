import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
  useWindowDimensions,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  runOnJS,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PetCanvas } from '../../src/components/PetCanvas';
import { PressableScale } from '../../src/components/PressableScale';
import { Sidebar } from '../../src/components/Sidebar';
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
import { colors, radius, spacing, tracking, typography } from '../../src/theme/tokens';
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

  const exitToastOpacity = useSharedValue(0);

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
          <View
            style={[
              styles.namePill,
              isTinyDevice && styles.namePillSmall,
            ]}
          >
            <Image
              source={require('../../assets/icon.png')}
              style={[
                styles.nameIcon,
                isTinyDevice && styles.nameIconSmall,
              ]}
              resizeMode="contain"
            />
            <Text
              style={[
                styles.nameText,
                isTinyDevice && styles.nameTextSmall,
              ]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
          </View>

          <View style={styles.topBarRight}>
            <PressableScale
              onPress={() => setQuestsVisible(true)}
              hitSlop={8}
              style={[
                styles.headerIconButton,
                isTinyDevice && styles.headerIconButtonSmall,
              ]}
            >
              <Ionicons name="flag-outline" size={isTinyDevice ? 16 : 18} color={colors.text} />
            </PressableScale>

            <PressableScale
              onPress={() => setSidebarVisible(true)}
              hitSlop={8}
              style={[
                styles.headerIconButton,
                isTinyDevice && styles.headerIconButtonSmall,
              ]}
            >
              <Ionicons name="menu" size={isTinyDevice ? 16 : 18} color={colors.text} />
            </PressableScale>
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
              onPress={handleFeed}
              style={[
                styles.primaryButtonSmall,
                isTinyDevice && styles.primaryButtonSmallTiny,
              ]}
            >
              <Ionicons name="nutrition-outline" size={isTinyDevice ? 12 : 14} color={colors.background} />
              <Text style={styles.primaryButtonText} numberOfLines={1}>
                {isDoneToday ? 'Fed' : 'Feed'}
              </Text>
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

            <View style={styles.sceneProgress}>
              <View style={styles.sceneProgressHeader}>
                <Text style={styles.sceneProgressTitle}>{displayName}'s evolution</Text>
                <Text style={styles.sceneProgressPercent}>
                  {Math.round(progressPercent)}%
                </Text>
              </View>
              <View style={styles.sceneProgressTrack}>
                <View
                  style={[
                    styles.sceneProgressFill,
                    { width: `${progressPercent}%` },
                  ]}
                />
              </View>
              <Text style={styles.sceneProgressStage}>
                {STAGE_NAMES[stage] ?? STAGE_NAMES[1]}
              </Text>
            </View>
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
            <View style={styles.footerStat}>
              <Ionicons name="flame-outline" size={14} color={colors.primary} />
              <Text style={styles.footerStatValue}>{streak}</Text>
              <Text style={styles.footerStatLabel}>streak</Text>
            </View>
            <View style={styles.footerStatDivider} />
            <View style={styles.footerStat}>
              <Ionicons name="wallet-outline" size={14} color={colors.warning} />
              <Text style={styles.footerStatValue}>{formatNumber(balance)}</Text>
              <Text style={styles.footerStatLabel}>coins</Text>
            </View>
            <View style={styles.footerStatDivider} />
            <View style={styles.footerStat}>
              <Ionicons name="star-outline" size={14} color={colors.textMuted} />
              <Text style={styles.footerStatValue}>{stage}</Text>
              <Text style={styles.footerStatLabel}>stage</Text>
            </View>
          </View>
        </View>

        {/* ACTION ROW */}
        <View style={styles.actionRow}>
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

        <View style={{ height: 24 }} />
      </ScrollView>

      <Sidebar
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
  namePill: {
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
  namePillSmall: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 4,
  },
  nameIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  nameIconSmall: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  nameText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
    maxWidth: 120,
  },
  nameTextSmall: {
    fontSize: 11,
    maxWidth: 90,
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
  headerIconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  headerIconButtonSmall: {
    width: 32,
    height: 32,
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
    position: 'relative',
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
    justifyContent: 'space-evenly',
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: colors.background,
  },
  footerStat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 8,
  },
  footerStatDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  footerStatValue: {
    color: colors.text,
    fontSize: 14,
    fontFamily: 'Poppins_800ExtraBold',
  },
  footerStatLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: 'Poppins_500Medium',
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

  /* ACTION ROW */
  actionRow: {
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

  /* PROGRESS (inside pet scene) */
  sceneProgress: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(7,17,31,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sceneProgressHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sceneProgressTitle: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: tracking.small * 12,
  },
  sceneProgressPercent: {
    color: colors.primary,
    fontSize: 12,
    fontFamily: 'Poppins_800ExtraBold',
    letterSpacing: tracking.small * 12,
  },
  sceneProgressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  sceneProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  sceneProgressStage: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: 'Poppins_500Medium',
  },
});
