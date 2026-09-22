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
import { GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PetCanvas } from '../../src/components/PetCanvas';
import { PressableScale } from '../../src/components/PressableScale';
import { StreakInfo } from '../../src/components/StreakInfo';
import { StreakFreezeSheet } from '../../src/components/StreakFreezeSheet';
import { LeagueSheet } from '../../src/components/LeagueSheet';
import { LeaderboardSheet } from '../../src/components/LeaderboardSheet';
import { MilestoneCelebration } from '../../src/components/MilestoneCelebration';
import { Sidebar, SIDEBAR_WIDTH, useSidebarOpenGesture } from '../../src/components/Sidebar';
import EvolutionCeremony from '../../src/components/EvolutionCeremony';
import CollectiblesSheet from '../../src/components/CollectiblesSheet';
import PrizeWheel from '../../src/components/PrizeWheel';
import QuestsSheet from '../../src/components/QuestsSheet';
import WaitlistSheet from '../../src/components/WaitlistSheet';
import FoodSheet, { type FoodItem } from '../../src/components/FoodSheet';
import DeathOverlay from '../../src/components/DeathOverlay';
import ReviveSheet from '../../src/components/ReviveSheet';
import CommunityResurrectSheet from '../../src/components/CommunityResurrectSheet';
import { ConnectDeviceSheet } from '../../src/components/ConnectDeviceSheet';
import { DCAHome } from '../../src/screens/dca/DCAHome';
import { useDcaSyncEngine } from '../../src/services/ble/SyncEngine';
import { dcaEvents, useDcaUiStore } from '../../src/services/dca';
import { MILESTONES, useCheckinStore } from '../../src/features/checkin/store';
import { localDayKey, useWheelStore } from '../../src/features/wheel/store';
import {
  BACKGROUND_COLORS,
  REVIVE_INVITES_REQUIRED,
  STAGE_NAMES,
  STAGE_THRESHOLDS,
  usePetStore,
  xpForNextLevel,
  type PetStage,
} from '../../src/features/pet/store';
import { useWalletStore } from '../../src/features/wallet/store';
import { useWallet } from '../../src/wallet/useWallet';
import { useFinagotchiDevice } from '../../src/features/ble';
import {
  useDeviceControlStore,
  useDeviceSync,
} from '../../src/features/ble/sync';
import { usePetStateSync } from '../../src/features/pet/usePetStateSync';
import { WaitingForSync } from '../../src/components/WaitingForSync';
import type { PetMood as EngineMood } from '../../src/engine/expressions';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
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

function formatNumber(num: number): string {
  return Math.round(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function happinessColor(value: number): string {
  if (value >= 70) return colors.success;
  if (value >= 40) return colors.warning;
  return colors.danger;
}

function HappinessBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = happinessColor(pct);
  const iconName = pct >= 70 ? 'heart' : pct >= 40 ? 'heart-half-outline' : 'heart-dislike-outline';
  return (
    <View style={styles.happinessBar}>
      <Ionicons name={iconName} size={12} color={color} />
      <View style={styles.happinessTrack}>
        <View
          style={[
            styles.happinessFill,
            {
              width: `${pct}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
      <Text style={[styles.happinessText, { color }]}>{pct}%</Text>
    </View>
  );
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
      <Ionicons name="shield-checkmark" size={12} color={colors.purple} />
      <Text style={styles.guardianText}>Guardian {timeLeft}</Text>
    </View>
  );
}

function project(initialVelocity: number, decelerationRate = 0.998) {
  'worklet';
  return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate);
}

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
  const [streakFreezeVisible, setStreakFreezeVisible] = useState(false);
  const [leagueVisible, setLeagueVisible] = useState(false);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  const [bleVisible, setBleVisible] = useState(false);
  const [reviveVisible, setReviveVisible] = useState(false);
  const [communityResurrectVisible, setCommunityResurrectVisible] = useState(false);
  const [wheelVisible, setWheelVisible] = useState(false);
  const [reaction, setReaction] = useState<PetReaction | undefined>(undefined);
  const [reactionKey, setReactionKey] = useState(0);
  const [actionMood, setActionMood] = useState<PetMood | undefined>(undefined);
  const [floatingEmoji, setFloatingEmoji] = useState<string | null>(null);
  const [exitToastVisible, setExitToastVisible] = useState(false);
  const [overdueSad, setOverdueSad] = useState(false);
  const [milestoneVisible, setMilestoneVisible] = useState(false);
  const [milestoneStreak, setMilestoneStreak] = useState(0);

  const lastBackPress = useRef(0);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emotionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exitToastOpacity = useSharedValue(0);
  const emojiOpacity = useSharedValue(0);
  const emojiTranslateY = useSharedValue(0);
  const sidebarTranslateX = useSharedValue(-SIDEBAR_WIDTH);
  const sidebarOpacity = useSharedValue(0);

  const wallet = useWallet();
  const ble = useFinagotchiDevice();

  const checkIn = useCheckinStore((state) => state.checkIn);
  const hasCheckedInToday = useCheckinStore((state) => state.hasCheckedInToday());
  const streak = useCheckinStore((state) => state.streak);
  const longestStreak = useCheckinStore((state) => state.longestStreak);
  const totalCheckins = useCheckinStore((state) => state.totalCheckins);
  const resetStreak = useCheckinStore((state) => state.resetStreak);
  const lastSpinDay = useWheelStore((state) => state.lastSpinDay);

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

  // Edge-swipe opens the sidebar. The gesture wraps the screen content, so
  // buttons stay tappable; it only engages on horizontal pulls from the left
  // edge and stays disabled while any sheet or overlay is open.
  const anyOverlayOpen =
    bleVisible ||
    collectiblesVisible ||
    questsVisible ||
    waitlistVisible ||
    foodVisible ||
    reviveVisible ||
    communityResurrectVisible ||
    wheelVisible ||
    celebratingStage !== null ||
    streakFreezeVisible ||
    leagueVisible ||
    leaderboardVisible ||
    isDead;

  const sidebarOpenGesture = useSidebarOpenGesture({
    translateX: sidebarTranslateX,
    opacity: sidebarOpacity,
    enabled: !sidebarVisible && !anyOverlayOpen,
    onOpen: () => setSidebarVisible(true),
  });

  const horizontalPadding = Math.min(Math.max(width * 0.05, 16), 24);
  const isDoneToday = hasCheckedInToday;
  // A spin is earned by checking in; it stays claimable until spun.
  const spinAvailable = isDoneToday && lastSpinDay !== localDayKey();

  const mood = useMemo(
    () => getMood(currentHour, isDoneToday, streak, happiness),
    [currentHour, isDoneToday, streak, happiness]
  );

  const xpNeeded = xpForNextLevel(level);
  const xpPercent = Math.min(100, Math.max(0, (xp / xpNeeded) * 100));

  const nextStageName =
    stage < 12 ? STAGE_NAMES[(stage + 1) as 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12] : 'Max';

  const effectiveMood = actionMood ?? (overdueSad ? 'sad' : mood);

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

  // Push pet state to the server so paired hardware can sync standalone.
  usePetStateSync();

  // DCA layer, in required order: a fill is points bump (FillWatcher's feed,
  // upstream) → pet dance (subscription here, registered first) → dca:hit
  // BLE write (SyncEngine subscription, registered second).
  const triggerEmotionRef = useRef(triggerEmotion);
  triggerEmotionRef.current = triggerEmotion;

  useEffect(
    () =>
      dcaEvents.on('dcaHit', () => {
        triggerEmotionRef.current('dance', 'happy');
      }),
    []
  );

  // Overdue plans nudge the pet mood toward sad until the plan recovers.
  useEffect(
    () =>
      dcaEvents.on('overdueChange', ({ overdue }) => {
        setOverdueSad(overdue);
      }),
    []
  );

  // Wizard success asks for an immediate dance on return.
  useEffect(() => {
    if (useDcaUiStore.getState().consumeReaction()) {
      triggerEmotionRef.current('dance', 'happy');
    }
  });

  // Frozen-contract epoch/plan/dca:hit writes to the device.
  useDcaSyncEngine(ble);

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

  const previousStreakRef = useRef(streak);
  useEffect(() => {
    if (streak > previousStreakRef.current && MILESTONES.includes(streak)) {
      setMilestoneStreak(streak);
      setMilestoneVisible(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    previousStreakRef.current = streak;
  }, [streak]);

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
      if (wheelVisible) {
        setWheelVisible(false);
        return true;
      }
      if (streakFreezeVisible) {
        setStreakFreezeVisible(false);
        return true;
      }
      if (leagueVisible) {
        setLeagueVisible(false);
        return true;
      }
      if (leaderboardVisible) {
        setLeaderboardVisible(false);
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
  }, [sidebarVisible, bleVisible, collectiblesVisible, questsVisible, waitlistVisible, foodVisible, communityResurrectVisible, wheelVisible, streakFreezeVisible, leagueVisible, leaderboardVisible, celebratingStage, stage]);

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
      const result = checkIn(true);
      if (result.success) {
        // Let the feeding reaction play, then offer the earned wheel spin.
        setTimeout(() => setWheelVisible(true), 1300);
      }
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

  const handlePetTap = useCallback(() => {
    if (isDead) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    triggerEmotion('jump', 'happy');
  }, [isDead]);

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
      <GestureDetector gesture={sidebarOpenGesture}>
        <View
          style={[
            styles.container,
            {
              paddingHorizontal: horizontalPadding,
            },
          ]}
        >
          {/* TOP BAR */}
          <View style={styles.topBar}>
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
                style={styles.headerIconButton}
              >
                <Ionicons
                  name="bluetooth"
                  size={18}
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

              <View style={styles.headerStatPill}>
                <Ionicons name="flame" size={14} color={colors.warning} />
                <Text style={styles.headerStatText}>{streak}</Text>
              </View>

              <View style={styles.headerStatPill}>
                <Ionicons name="diamond" size={14} color={colors.cyan} />
                <Text style={styles.headerStatText}>{formatNumber(balance)}</Text>
              </View>
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
                </View>
                <HappinessBar value={happiness} />
              </View>

              <PressableScale
                onPress={openFoodSheet}
                style={styles.feedButton}
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

              {spinAvailable && !isDead && (
                <PressableScale
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setWheelVisible(true);
                  }}
                  style={styles.spinPill}
                >
                  <Ionicons name="gift" size={12} color={colors.warning} />
                  <Text style={styles.spinPillText}>Spin</Text>
                </PressableScale>
              )}

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
                {floatingEmoji && (
                  <Animated.View style={[styles.floatingEmoji, emojiStyle]}>
                    <Text style={styles.floatingEmojiText}>{floatingEmoji}</Text>
                  </Animated.View>
                )}
              </View>

              <GuardianBadge />
            </View>
          </View>

          {/* STREAK ROW */}
          <StreakInfo onOpenFreeze={() => setStreakFreezeVisible(true)} />

          {/* LEAGUE / LEADERBOARD ROW */}
          <View style={styles.socialRow}>
            <PressableScale onPress={() => setLeagueVisible(true)} style={styles.socialButton}>
              <Ionicons name="trophy" size={18} color={colors.warning} />
              <Text style={styles.socialButtonText}>League</Text>
            </PressableScale>
            <PressableScale onPress={() => setLeaderboardVisible(true)} style={styles.socialButton}>
              <Ionicons name="podium" size={18} color={colors.purple} />
              <Text style={styles.socialButtonText}>Leaderboard</Text>
            </PressableScale>
          </View>

          {/* DCA PROMO */}
          <View style={styles.dcaCardWrap}>
            <DCAHome />
          </View>

          {/* ACTION BAR */}
          <View style={styles.actionBar}>
            <PressableScale onPress={handleCollectibles} style={styles.actionBarIcon}>
              <Ionicons name="color-palette-outline" size={22} color={colors.text} />
            </PressableScale>

            <PressableScale onPress={handleHardware} style={styles.actionBarIcon}>
              <Ionicons name="hardware-chip-outline" size={22} color={colors.text} />
            </PressableScale>

            <PressableScale
              onPress={() => {
                if (spinAvailable) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setWheelVisible(true);
                } else if (!isDoneToday) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setFoodVisible(true);
                } else {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  triggerEmotion('jump', 'happy');
                }
              }}
              style={styles.primaryAction}
            >
              <Text style={styles.primaryActionText}>
                {spinAvailable ? 'Spin wheel' : !isDoneToday ? 'Check in' : 'Caress'}
              </Text>
            </PressableScale>

            <PressableScale onPress={() => setQuestsVisible(true)} style={styles.actionBarIcon}>
              <Ionicons name="flag-outline" size={22} color={colors.text} />
            </PressableScale>

            <PressableScale onPress={handleGames} style={styles.actionBarIcon}>
              <Ionicons name="game-controller-outline" size={22} color={colors.textMuted} />
            </PressableScale>
          </View>
        </View>
      </GestureDetector>

      <Sidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        onOpenQuests={() => setQuestsVisible(true)}
        onOpenWaitlist={() => setWaitlistVisible(true)}
        translateX={sidebarTranslateX}
        opacity={sidebarOpacity}
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

      <PrizeWheel
        visible={wheelVisible}
        onClose={() => setWheelVisible(false)}
      />

      <MilestoneCelebration
        visible={milestoneVisible}
        streak={milestoneStreak}
        onDismiss={() => setMilestoneVisible(false)}
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

      <StreakFreezeSheet
        visible={streakFreezeVisible}
        onClose={() => setStreakFreezeVisible(false)}
      />

      <LeagueSheet
        visible={leagueVisible}
        onClose={() => setLeagueVisible(false)}
      />

      <LeaderboardSheet
        visible={leaderboardVisible}
        onClose={() => setLeaderboardVisible(false)}
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
    gap: spacing.sm,
    paddingTop: 4,
  },
  exitToast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,27,46,0.92)',
    borderWidth: 1,
    borderColor: colors.border,
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
    gap: spacing.sm,
  },
  appIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerStatText: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'Poppins_800ExtraBold',
  },
  bleStatusDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.surface,
  },

  /* PET CARD */
  petCard: {
    flex: 1,
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  petCardHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
  },
  petName: {
    color: colors.text,
    fontSize: typography.heading,
    fontFamily: 'Poppins_700Bold',
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  levelText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'Poppins_700Bold',
  },
  xpTrackMini: {
    width: 70,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  xpFillMini: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.purple,
  },
  xpTextMini: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: 'Poppins_700Bold',
  },
  socialRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  socialButtonText: {
    fontSize: 11,
    fontFamily: 'Poppins_800ExtraBold',
    color: colors.text,
  },
  happinessBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  happinessTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  happinessFill: {
    height: '100%',
    borderRadius: 2,
  },
  happinessText: {
    fontSize: 10,
    fontFamily: 'Poppins_800ExtraBold',
    minWidth: 28,
    textAlign: 'right',
  },
  feedButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fruitIcon: {
    fontSize: 22,
  },

  /* SCENE */
  scene: {
    flex: 1,
    width: '100%',
    minHeight: 160,
    borderRadius: radius.lg,
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
    borderRadius: radius.pill,
    backgroundColor: 'rgba(153,69,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(153,69,255,0.32)',
    zIndex: 5,
  },
  guardianText: {
    color: colors.purple,
    fontSize: 10,
    fontFamily: 'Poppins_800ExtraBold',
  },
  spinPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(7,17,31,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,209,102,0.45)',
    zIndex: 5,
  },
  spinPillText: {
    color: colors.text,
    fontSize: 10,
    fontFamily: 'Poppins_800ExtraBold',
  },

  /* DCA PROMO */
  dcaCardWrap: {
    width: '100%',
  },

  /* ACTION BAR */
  actionBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 0,
  },
  actionBarIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  primaryAction: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  primaryActionText: {
    color: colors.background,
    fontSize: 15,
    fontFamily: 'Poppins_800ExtraBold',
  },
});
