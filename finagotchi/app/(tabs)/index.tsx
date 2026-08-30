import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  Share,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PetCanvas } from '../../src/components/PetCanvas';
import { PressableScale } from '../../src/components/PressableScale';
import { LevelUpAnimation } from '../../src/components/LevelUpAnimation';
import { Sidebar } from '../../src/components/Sidebar';
import EvolutionCeremony from '../../src/components/EvolutionCeremony';
import CollectiblesSheet from '../../src/components/CollectiblesSheet';
import QuestsSheet from '../../src/components/QuestsSheet';
import WaitlistSheet from '../../src/components/WaitlistSheet';
import FoodSheet, { type FoodItem } from '../../src/components/FoodSheet';
import DeathOverlay from '../../src/components/DeathOverlay';
import ReviveSheet from '../../src/components/ReviveSheet';
import CommunityResurrectSheet from '../../src/components/CommunityResurrectSheet';
import { ConnectDeviceSheet } from '../../src/components/ConnectDeviceSheet';
import { useCheckinStore } from '../../src/features/checkin/store';
import {
  BACKGROUND_COLORS,
  REVIVE_INVITES_REQUIRED,
  STAGE_NAMES,
  STAGE_THRESHOLDS,
  usePetStore,
  type PetStage,
} from '../../src/features/pet/store';
import { useWalletStore } from '../../src/features/wallet/store';
import { useWallet } from '../../src/wallet/useWallet';
import { useFinagotchiDevice } from '../../src/features/ble';
import {
  useDeviceControlStore,
  useDeviceSync,
} from '../../src/features/ble/sync';
import { WaitingForSync } from '../../src/components/WaitingForSync';
import type { PetMood as EngineMood } from '../../src/engine/expressions';
import { colors, radius, spacing, tracking, typography } from '../../src/theme/tokens';
import type { PetMood, PetReaction } from '../../src/components/PetCanvas';

function getMood(
  hour: number,
  hasCheckedInToday: boolean,
  streak: number,
  happiness: number
): PetMood {
  if (happiness <= 0) {
    return 'sad';
  }

  if (happiness < 30) {
    return 'sad';
  }

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
  if (stage >= STAGE_THRESHOLDS.length - 1) {
    return 100;
  }

  const currentThreshold = STAGE_THRESHOLDS[stage] ?? 0;
  const nextThreshold = STAGE_THRESHOLDS[stage + 1] ?? currentThreshold + 1;
  const range = nextThreshold - currentThreshold;

  if (range <= 0) return 100;

  return Math.min(Math.max(0, ((streak - currentThreshold) / range) * 100), 100);
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

/**
 * Self-ticking guardian countdown badge. Ticks locally so the home screen
 * doesn't re-render every second just to update this label.
 */
function GuardianBadge() {
  const isGuardianActive = usePetStore((state) => state.isGuardianActive);
  const getGuardianRemainingMs = usePetStore(
    (state) => state.getGuardianRemainingMs
  );
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const update = () => {
      setTimeLeft(
        isGuardianActive() ? formatCountdown(getGuardianRemainingMs()) : ''
      );
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isGuardianActive, getGuardianRemainingMs]);

  if (!timeLeft) return null;

  return (
    <View style={styles.guardianBadge}>
      <Ionicons name="shield-checkmark" size={12} color="#8B5CF6" />
      <Text style={styles.guardianText}>Guardian {timeLeft}</Text>
    </View>
  );
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
  mood: PetMood;
};

const PET_ACTIONS: PetAction[] = [
  { id: 'caress', icon: 'hand-left-outline', label: 'Caress', cost: 0, reaction: 'jump', mood: 'happy' },
  { id: 'treat', icon: 'nutrition-outline', label: 'Treat', cost: 50, reaction: 'glow', mood: 'happy' },
  { id: 'play', icon: 'game-controller-outline', label: 'Play', cost: 100, reaction: 'dance', mood: 'calm' },
  { id: 'train', icon: 'barbell-outline', label: 'Train', cost: 250, reaction: 'spin', mood: 'proud' },
];

// Upper bound for the actions drawer content (one row of action buttons,
// ~80 pt). Accordion animates maxHeight toward this bound; content is
// clipped by overflow while collapsed.
const ACTIONS_DRAWER_MAX_HEIGHT = 120;

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const currentHour = now.getHours();

  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [collectiblesVisible, setCollectiblesVisible] = useState(false);
  const [questsVisible, setQuestsVisible] = useState(false);
  const [waitlistVisible, setWaitlistVisible] = useState(false);
  const [foodVisible, setFoodVisible] = useState(false);
  const [bleVisible, setBleVisible] = useState(false);
  const [reviveVisible, setReviveVisible] = useState(false);
  const [communityResurrectVisible, setCommunityResurrectVisible] = useState(false);
  const [reaction, setReaction] = useState<PetReaction | undefined>(undefined);
  const [reactionKey, setReactionKey] = useState(0);
  const [actionMood, setActionMood] = useState<PetMood | undefined>(undefined);
  const [floatingEmoji, setFloatingEmoji] = useState<string | null>(null);
  const [exitToastVisible, setExitToastVisible] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const lastBackPress = useRef(0);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emotionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exitToastOpacity = useSharedValue(0);
  const emojiOpacity = useSharedValue(0);
  const emojiTranslateY = useSharedValue(0);
  const actionsProgress = useSharedValue(0);

  const wallet = useWallet();
  const ble = useFinagotchiDevice();

  const checkIn = useCheckinStore((state) => state.checkIn);
  const hasCheckedInToday = useCheckinStore((state) => state.hasCheckedInToday());
  const streak = useCheckinStore((state) => state.streak);
  const longestStreak = useCheckinStore((state) => state.longestStreak);
  const totalCheckins = useCheckinStore((state) => state.totalCheckins);
  const resetStreak = useCheckinStore((state) => state.resetStreak);

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
  const happiness = usePetStore((state) => state.happiness);
  const decayHappiness = usePetStore((state) => state.decayHappiness);
  const boostHappiness = usePetStore((state) => state.boostHappiness);
  const isDead = usePetStore((state) => state.isDead);
  const isSpectral = usePetStore((state) => state.isSpectral);
  const causeOfDeath = usePetStore((state) => state.causeOfDeath);
  const level = usePetStore((state) => state.level);
  const xp = usePetStore((state) => state.xp);
  const reviveTokens = usePetStore((state) => state.reviveTokens);
  const reviveInvites = usePetStore((state) => state.reviveInvites);
  const addReviveInvite = usePetStore((state) => state.addReviveInvite);
  const addXp = usePetStore((state) => state.addXp);
  const reviveCreature = usePetStore((state) => state.reviveCreature);
  const reviveWindowEndsAt = usePetStore((state) => state.reviveWindowEndsAt);
  const isReviveWindowActive = usePetStore((state) => state.isReviveWindowActive);
  const checkLifeTimer = usePetStore((state) => state.checkLifeTimer);
  const hireGuardian = usePetStore((state) => state.hireGuardian);
  const useFreeAction = usePetStore((state) => state.useFreeAction);
  const deathCount = usePetStore((state) => state.deathCount);

  const [celebratingStage, setCelebratingStage] = useState<PetStage | null>(
    stage > lastCelebratedStage ? stage : null
  );

  const horizontalPadding = Math.min(Math.max(width * 0.05, 16), 24);
  const isSmallDevice = width < 360;
  const isTinyDevice = width < 330;
  const scale = Math.min(Math.max(width / 375, 0.9), 1.1);

  const isDoneToday = hasCheckedInToday;

  const mood = useMemo(
    () => getMood(currentHour, isDoneToday, streak, happiness),
    [currentHour, isDoneToday, streak, happiness]
  );

  const progressPercent = useMemo(
    () => computeProgressPercent(streak, stage),
    [streak, stage]
  );

  const xpNeeded = level * 100;
  const xpPercent = Math.min(100, Math.max(0, (xp / xpNeeded) * 100));

  const nextStageName =
    stage < 5 ? STAGE_NAMES[(stage + 1) as 2 | 3 | 4 | 5] : 'Max';

  const effectiveMood = actionMood ?? mood;

  // App label → engine expression; proud renders as happy, sleeping as sleepy.
  const currentEngineMood: EngineMood =
    effectiveMood === 'sleeping'
      ? 'sleepy'
      : effectiveMood === 'proud'
        ? 'happy'
        : effectiveMood;

  // Mirror stage/mood/accessory/reactions to the connected device and back.
  useDeviceSync(ble, currentEngineMood, reaction, reactionKey);
  const deviceMood = useDeviceControlStore((state) => state.deviceMood);

  // While a link attempt is in flight, mirror the device's own waiting scene:
  // waiting expression + orbiting comets, cleared by the first state
  // notification (status flips to 'connected').
  const waitingForSync =
    ble.status === 'scanning' ||
    ble.status === 'connecting' ||
    ble.status === 'reconnecting';

  // Tick store-side life/happiness logic once a second. Countdown text lives
  // in self-ticking components (LifeTimerPill, GuardianBadge) so this screen
  // no longer re-renders every second.
  useEffect(() => {
    const update = () => {
      checkLifeTimer();
      decayHappiness();
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [checkLifeTimer, decayHappiness]);

  useEffect(() => {
    if (isDead) {
      resetStreak();
    }
  }, [isDead, resetStreak]);

  useEffect(() => {
    return () => {
      if (emotionTimerRef.current) {
        clearTimeout(emotionTimerRef.current);
      }
    };
  }, []);

  // Double-tap back to exit, with visual feedback. Close any open sheet/sidebar first.
  useEffect(() => {
    const onBackPress = () => {
      if (sidebarVisible) {
        setSidebarVisible(false);
        return true;
      }
      if (bleVisible) {
        setBleVisible(false);
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
      if (foodVisible) {
        setFoodVisible(false);
        return true;
      }
      if (communityResurrectVisible) {
        setCommunityResurrectVisible(false);
        return true;
      }
      if (celebratingStage !== null) {
        setCelebratingStage(null);
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
  }, [sidebarVisible, bleVisible, collectiblesVisible, questsVisible, waitlistVisible, foodVisible, communityResurrectVisible, celebratingStage, stage]);

  const REACTION_EMOJIS: Record<PetReaction, string> = {
    jump: '❤️',
    glow: '✨',
    dance: '🎵',
    spin: '🌟',
  };

  function triggerEmotion(newReaction: PetReaction, newMood: PetMood) {
    if (emotionTimerRef.current) {
      clearTimeout(emotionTimerRef.current);
    }

    setActionMood(newMood);
    setReaction(newReaction);
    setReactionKey((key) => key + 1);
    setFloatingEmoji(REACTION_EMOJIS[newReaction]);

    emojiOpacity.value = 0;
    emojiTranslateY.value = 0;
    emojiOpacity.value = withTiming(1, { duration: 180 });
    emojiTranslateY.value = withTiming(-28, { duration: 900 });

    emotionTimerRef.current = setTimeout(() => {
      emojiOpacity.value = withTiming(0, { duration: 220 });
      setActionMood(undefined);
      setReaction(undefined);
      setFloatingEmoji(null);
    }, 1800);
  }

  function openFoodSheet() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFoodVisible(true);
  }

  function handleFoodSelect(food: FoodItem) {
    if (isDead) return;

    const cost = isDoneToday ? food.cost : 0;
    if (cost > balance) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!isDoneToday) {
      checkIn(true);
    }

    if (cost > 0) {
      spendBalance(cost);
    }

    boostHappiness(food.happiness);
    addXp(10);
    triggerEmotion(food.reaction, food.mood);
    setFoodVisible(false);
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
    if (isDead) return;

    if (action.cost === 0) {
      if (!useFreeAction()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          'Daily limit reached',
          'You used all your free caresses for today. Come back tomorrow!'
        );
        return;
      }
    } else {
      const success = spendBalance(action.cost);
      if (!success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const happinessBoost =
      action.id === 'caress' ? 8 :
      action.id === 'treat' ? 5 :
      action.id === 'play' ? 15 :
      action.id === 'train' ? 20 : 5;

    boostHappiness(happinessBoost);
    addXp(5);
    triggerEmotion(action.reaction, action.mood);
  }

  const handlePetTap = useCallback(() => {
    if (isDead) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    triggerEmotion('jump', 'happy');
  }, [isDead]);

  function toggleActionsDrawer() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !actionsOpen;
    setActionsOpen(next);
    actionsProgress.value = withTiming(next ? 1 : 0, { duration: 220 });
  }

  // Drag-to-look: steer the on-device gaze too (throttled by RadialPet).
  const handlePetLook = useCallback(
    (yaw: number, pitch: number) => {
      if (!ble.connectedDevice) return;
      ble.sendCommand(`look:${Math.round(yaw)},${Math.round(pitch)}`);
    },
    [ble.sendCommand, ble.connectedDevice]
  );

  const handlePetLookEnd = useCallback(() => {
    if (!ble.connectedDevice) return;
    ble.sendCommand('look:off');
  }, [ble.sendCommand, ble.connectedDevice]);

  const handleEvolve = useCallback((newStage: PetStage) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCelebratingStage(newStage);
  }, []);

  function handleOpenRevive() {
    setReviveVisible(true);
  }

  function handleHireGuardian() {
    const GUARDIAN_HOURS = 12;
    const GUARDIAN_COST = 300;
    const success = hireGuardian(GUARDIAN_HOURS, GUARDIAN_COST);
    if (!success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Not enough points',
        `A ${GUARDIAN_HOURS}h guardian costs ${GUARDIAN_COST} points.`
      );
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function handleAskCommunity() {
    setCommunityResurrectVisible(true);
  }

  function handleCommunityResurrect() {
    const COMMUNITY_REVIVE_COST = 250;
    if (balance < COMMUNITY_REVIVE_COST) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    usePetStore.setState({ balance: balance - COMMUNITY_REVIVE_COST });
    reviveCreature(false);
  }

  async function handleInviteForRevive() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await Share.share({
        message: `Join me on Finagotchi and raise your own savings companion — ${displayName} needs ${REVIVE_INVITES_REQUIRED} friends to come back to life!`,
        url: 'https://www.finagotchi.app/invite?ref=revive',
        title: 'Join me on Finagotchi',
      });
      if (result.action === Share.sharedAction) {
        addReviveInvite();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      // User cancelled or share failed; no invite counted.
    }
  }

  async function handleRevive() {
    const REMINT_COST_POINTS = 500;
    const windowActive = isReviveWindowActive();

    if (windowActive) {
      if (reviveInvites >= REVIVE_INVITES_REQUIRED) {
        // Free revive earned by inviting friends; the invite counter is
        // consumed by reviveCreature below.
      } else if (reviveTokens > 0) {
        usePetStore.setState({ reviveTokens: reviveTokens - 1 });
      } else if (balance >= REMINT_COST_POINTS) {
        usePetStore.setState({ balance: balance - REMINT_COST_POINTS });
      } else {
        const walletConnected = Boolean(useWalletStore.getState().address);
        if (!walletConnected) {
          Alert.alert(
            'Wallet required',
            'Connect a wallet to pay the SOL revive fee.'
          );
          return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await wallet.payReviveFee();
      }
    }

    if (!windowActive) {
      resetStreak();
    }

    reviveCreature(!windowActive);
    setReviveVisible(false);
  }

  const displayName = petName || 'Finny';

  const emojiStyle = useAnimatedStyle(() => ({
    opacity: emojiOpacity.value,
    transform: [{ translateY: emojiTranslateY.value }],
  }));

  const actionsDrawerStyle = useAnimatedStyle(() => ({
    maxHeight: ACTIONS_DRAWER_MAX_HEIGHT * actionsProgress.value,
    opacity: actionsProgress.value,
  }));

  const actionsChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(1 - actionsProgress.value) * 180}deg` }],
  }));

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
      <View
        style={[
          styles.container,
          {
            paddingHorizontal: horizontalPadding,
          },
        ]}
      >
        {/* TOP BAR */}
        <View style={[styles.topBar, isTinyDevice && styles.topBarWrap]}>
          <PressableScale
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSidebarVisible(true);
            }}
            hitSlop={8}
            accessibilityLabel="Open menu"
          >
            <Image
              source={require('../../assets/ghost-icon-animated.gif')}
              style={styles.appIcon}
              resizeMode="contain"
            />
          </PressableScale>

          <View style={styles.topBarRight}>
            <PressableScale
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setBleVisible(true);
              }}
              hitSlop={8}
              style={[
                styles.headerIconButton,
                isTinyDevice && styles.headerIconButtonSmall,
              ]}
            >
              <Ionicons
                name="bluetooth"
                size={isTinyDevice ? 16 : 18}
                color={ble.connectedDevice ? colors.primary : colors.text}
              />
              <View
                style={[
                  styles.bleStatusDot,
                  {
                    backgroundColor: ble.connectedDevice
                      ? '#5DE2A6'
                      : ble.status === 'reconnecting' || ble.status === 'error'
                        ? colors.danger
                        : colors.textMuted,
                  },
                ]}
              />
            </PressableScale>

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
          </View>
        </View>

        {/* PET CARD */}
        <View style={styles.petCard}>
          <View style={styles.petCardHeader}>
            <View>
              <Text style={styles.petName}>{displayName}</Text>
              <View style={styles.levelRow}>
                <Text style={styles.levelText}>Lv {level}</Text>
                <View style={styles.xpTrackMini}>
                  <View style={[styles.xpFillMini, { width: `${xpPercent}%` }]} />
                </View>
                <Text style={styles.xpTextMini}>
                  {xp}/{xpNeeded}
                </Text>
                <LevelUpAnimation level={level} />
              </View>
            </View>

            <PressableScale
              onPress={openFoodSheet}
              style={[styles.feedButton, isTinyDevice && styles.feedButtonTiny]}
            >
              <Text style={styles.fruitIcon}>🍎</Text>
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

            <GuardianBadge />

            <View style={styles.streakPill}>
              <Ionicons name="flame" size={12} color={colors.primary} />
              <Text style={styles.streakPillText}>{streak}</Text>
            </View>

            <View style={styles.petCenter}>
              {celebratingStage === null && (
                <PetCanvas
                  mood={effectiveMood}
                  engineMood={waitingForSync ? 'waiting' : deviceMood}
                  reaction={reaction}
                  reactionKey={reactionKey}
                  accessory={accessory}
                  isSpectral={isSpectral}
                  onTap={handlePetTap}
                  onEvolve={handleEvolve}
                  onLook={handlePetLook}
                  onLookEnd={handlePetLookEnd}
                />
              )}
              {waitingForSync && <WaitingForSync />}
              {(effectiveMood === 'happy' || effectiveMood === 'proud') && (
                <Text style={styles.floatingHeart}>❤️</Text>
              )}
              {floatingEmoji && (
                <Animated.View style={[styles.floatingEmoji, emojiStyle]}>
                  <Text style={styles.floatingEmojiText}>{floatingEmoji}</Text>
                </Animated.View>
              )}
            </View>

            <View style={styles.evolutionOverlay}>
              <Text style={styles.evolutionStageName}>
                {STAGE_NAMES[stage]}
              </Text>
              <View style={styles.evolutionTrack}>
                <View
                  style={[
                    styles.evolutionFill,
                    { width: `${progressPercent}%` },
                  ]}
                />
              </View>
              <Text style={styles.evolutionNext}>
                Next: {nextStageName}
              </Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Ionicons name="wallet-outline" size={14} color={colors.warning} />
              <Text style={styles.statValue}>{formatNumber(balance)}</Text>
              <Text style={styles.statLabel}>points</Text>
            </View>
            <View
              style={[
                styles.statChip,
                happiness <= 30 && styles.statChipDanger,
              ]}
            >
              <Ionicons
                name="happy-outline"
                size={14}
                color={happiness > 30 ? '#FF8E9E' : colors.danger}
              />
              <Text
                style={[
                  styles.statValue,
                  happiness <= 30 && styles.statValueDanger,
                ]}
              >
                {Math.round(happiness)}%
              </Text>
              <Text style={styles.statLabel}>happiness</Text>
            </View>
          </View>

          {waitingForSync && (
            <Text style={styles.syncCaption}>
              {'waiting for sync…\nopen the Finagotchi app'}
            </Text>
          )}

          <View style={styles.actionsDrawer}>
            <PressableScale
              onPress={toggleActionsDrawer}
              style={styles.actionsHandle}
            >
              <View style={styles.actionsHandleBar} />
              <View style={styles.actionsHandleRow}>
                <Text style={styles.actionsHandleText}>Actions</Text>
                <Animated.View style={actionsChevronStyle}>
                  <Ionicons
                    name="chevron-up"
                    size={14}
                    color={colors.textMuted}
                  />
                </Animated.View>
              </View>
            </PressableScale>

            <Animated.View style={[styles.actionsDrawerClip, actionsDrawerStyle]}>
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
            </Animated.View>
          </View>
        </View>

        {/* TABS */}
        <View style={styles.tabBar}>
          <PressableScale
            onPress={handleCollectibles}
            style={styles.tab}
          >
            <Ionicons
              name="color-palette-outline"
              size={20}
              color={colors.text}
            />
            <Text style={styles.tabText}>Collectibles</Text>
          </PressableScale>

          <PressableScale
            onPress={handleHardware}
            style={styles.tab}
          >
            <Ionicons name="hardware-chip-outline" size={20} color={colors.text} />
            <Text style={styles.tabText}>Hardware</Text>
          </PressableScale>

          <PressableScale
            onPress={handleGames}
            style={[styles.tab, styles.tabMuted]}
          >
            <Ionicons name="game-controller-outline" size={20} color={colors.textMuted} />
            <Text style={[styles.tabText, styles.tabTextMuted]}>Games</Text>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Soon</Text>
            </View>
          </PressableScale>
        </View>
      </View>

      <Sidebar
        visible={sidebarVisible}
        onOpen={() => setSidebarVisible(true)}
        onClose={() => setSidebarVisible(false)}
        onOpenQuests={() => setQuestsVisible(true)}
        onOpenWaitlist={() => setWaitlistVisible(true)}
      />

      <EvolutionCeremony
        visible={celebratingStage !== null}
        stage={celebratingStage ?? stage}
        petName={petName}
        onDismiss={() => {
          setCelebratingStage(null);
          setLastCelebratedStage(stage);
        }}
      />

      <CollectiblesSheet
        visible={collectiblesVisible}
        onClose={() => setCollectiblesVisible(false)}
      />

      <QuestsSheet
        visible={questsVisible}
        onClose={() => setQuestsVisible(false)}
        onOpenRevive={() => setReviveVisible(true)}
      />

      <WaitlistSheet
        visible={waitlistVisible}
        onClose={() => setWaitlistVisible(false)}
      />

      <ConnectDeviceSheet
        visible={bleVisible}
        onClose={() => setBleVisible(false)}
        ble={ble}
      />

      <FoodSheet
        visible={foodVisible}
        onClose={() => setFoodVisible(false)}
        onSelectFood={handleFoodSelect}
        isDoneToday={isDoneToday}
        balance={balance}
      />

      {isDead && (
        <DeathOverlay
          creatureName={displayName}
          causeOfDeath={causeOfDeath}
          streak={streak}
          level={level}
          deathCount={deathCount}
          balance={balance}
          reviveTokens={reviveTokens}
          reviveInvites={reviveInvites}
          reviveInvitesRequired={REVIVE_INVITES_REQUIRED}
          reviveWindowEndsAt={reviveWindowEndsAt}
          onRevive={handleOpenRevive}
          onInvite={handleInviteForRevive}
          onHireGuardian={handleHireGuardian}
          onAskCommunity={handleAskCommunity}
        />
      )}

      <ReviveSheet
        visible={reviveVisible}
        onClose={() => setReviveVisible(false)}
        creatureName={displayName}
        balance={balance}
        reviveTokens={reviveTokens}
        reviveInvites={reviveInvites}
        reviveInvitesRequired={REVIVE_INVITES_REQUIRED}
        reviveWindowEndsAt={reviveWindowEndsAt}
        onRevive={handleRevive}
        onInvite={handleInviteForRevive}
        onHireGuardian={handleHireGuardian}
      />

      <CommunityResurrectSheet
        visible={communityResurrectVisible}
        onClose={() => setCommunityResurrectVisible(false)}
        creatureName={displayName}
        balance={balance}
        onResurrect={handleCommunityResurrect}
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
    flex: 1,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    justifyContent: 'space-between',
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
    marginBottom: 10,
    gap: 8,
  },
  topBarWrap: {
    flexWrap: 'wrap',
  },
  appIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
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
  bleStatusDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.surface,
  },

  /* PET CARD */
  petCard: {
    flex: 1,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  petCardHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
  },
  petName: {
    color: colors.text,
    fontSize: 22,
    fontFamily: 'Poppins_800ExtraBold',
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  levelText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'Poppins_700Bold',
  },
  xpTrackMini: {
    width: 80,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  xpFillMini: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#8B5CF6',
  },
  xpTextMini: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: 'Poppins_700Bold',
  },
  feedButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  feedButtonTiny: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  fruitIcon: {
    fontSize: 22,
  },

  /* SCENE */
  scene: {
    flex: 1,
    width: '100%',
    minHeight: 180,
    borderRadius: 20,
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
  petCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  floatingHeart: {
    position: 'absolute',
    top: -6,
    right: -18,
    fontSize: 20,
    zIndex: 3,
  },
  floatingEmoji: {
    position: 'absolute',
    top: -8,
    right: -22,
    zIndex: 4,
  },
  floatingEmojiText: {
    fontSize: 22,
  },
  guardianBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.30)',
    zIndex: 5,
  },
  guardianText: {
    color: '#8B5CF6',
    fontSize: 10,
    fontFamily: 'Poppins_800ExtraBold',
  },
  streakPill: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(7,17,31,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 5,
  },
  streakPillText: {
    color: colors.text,
    fontSize: 10,
    fontFamily: 'Poppins_800ExtraBold',
  },
  syncCaption: {
    width: '100%',
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    fontFamily: 'Poppins_600SemiBold',
  },

  /* EVOLUTION OVERLAY */
  evolutionOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(7,17,31,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  evolutionStageName: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'Poppins_800ExtraBold',
  },
  evolutionTrack: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  evolutionFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  evolutionNext: {
    color: colors.textMuted,
    fontSize: 9,
    fontFamily: 'Poppins_600SemiBold',
  },

  /* STATS ROW */
  statsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  statChipDanger: {
    backgroundColor: 'rgba(255,100,124,0.10)',
  },
  statValue: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'Poppins_800ExtraBold',
  },
  statValueDanger: {
    color: colors.danger,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontFamily: 'Poppins_600SemiBold',
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
    gap: 4,
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

  /* ACTIONS DRAWER */
  actionsDrawer: {
    marginHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  actionsHandle: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 6,
    gap: 4,
  },
  actionsHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  actionsHandleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionsHandleText: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  actionsDrawerClip: {
    overflow: 'hidden',
  },

  /* TABS */
  tabBar: {
    width: '100%',
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tabText: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
  },
  tabMuted: {
    backgroundColor: 'rgba(14,27,46,0.60)',
    borderColor: 'rgba(255,255,255,0.04)',
  },
  tabTextMuted: {
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
});
