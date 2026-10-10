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
  FadeIn,
  FadeInDown,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PetCanvas, PetStageProgress } from '../../src/components/PetCanvas';
import { PressableScale } from '../../src/components/PressableScale';
import { ActionsDialog } from '../../src/components/ActionsDialog';
import { GradientFill } from '../../src/components/GradientFill';
import { ScreenGradient } from '../../src/components/ScreenGradient';
import { StreakInfo } from '../../src/components/StreakInfo';
import { StreakFreezeSheet } from '../../src/components/StreakFreezeSheet';
import { LeagueSheet } from '../../src/components/LeagueSheet';
import { LeaderboardSheet } from '../../src/components/LeaderboardSheet';
import { MilestoneCelebration } from '../../src/components/MilestoneCelebration';
import { Sidebar, getSidebarWidth, useSidebarOpenGesture } from '../../src/components/Sidebar';
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
import { getMood } from '../../src/features/pet/mood';
import { WaitingForSync } from '../../src/components/WaitingForSync';
import type { PetMood as EngineMood } from '../../src/engine/expressions';
import {
  colors,
  fonts,
  gradients,
  landing,
  radius,
  spacing,
  tracking,
  typography,
} from '../../src/theme/tokens';
import type { PetMood, PetReaction } from '../../src/components/PetCanvas';

/** Point costs from the reference app-screen mock's Actions panel. */
const ACTION_COSTS = {
  caress: 0,
  treat: 50,
  play: 100,
  train: 250,
} as const;

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
      <Ionicons name="shield-checkmark" size={12} color={colors.amber} />
      <Text style={styles.guardianText}>Guardian {timeLeft}</Text>
    </View>
  );
}

/**
 * Self-ticking Care Clock countdown ("2d 18h left"). Ticks locally so the
 * home screen doesn't re-render just to update this label.
 */
function LifeTimerText() {
  const getRemaining = usePetStore((state) => state.getLifeTimerRemainingMs);
  const [text, setText] = useState('');

  useEffect(() => {
    const update = () => {
      const ms = Math.max(0, getRemaining());
      const days = Math.floor(ms / 86400000);
      const hours = Math.floor((ms % 86400000) / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      setText(days > 0 ? `${days}d ${hours}h left` : `${hours}h ${minutes}m left`);
    };

    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [getRemaining]);

  return (
    <View style={styles.lifeTimerRow}>
      <Ionicons name="heart-outline" size={11} color={colors.heart} />
      <Text style={styles.lifeTimerText}>{text}</Text>
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
  const [actionsVisible, setActionsVisible] = useState(false);
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
  const sidebarWidth = getSidebarWidth(width);
  const sidebarTranslateX = useSharedValue(-sidebarWidth);
  const sidebarOpacity = useSharedValue(0);

  const wallet = useWallet();
  const ble = useFinagotchiDevice();

  const checkIn = useCheckinStore((state) => state.checkIn);
  const hasCheckedInToday = useCheckinStore((state) => state.hasCheckedInToday());
  const streak = useCheckinStore((state) => state.streak);
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
    actionsVisible ||
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
    sidebarWidth,
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
      if (actionsVisible) {
        setActionsVisible(false);
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
  }, [sidebarVisible, bleVisible, collectiblesVisible, questsVisible, waitlistVisible, foodVisible, communityResurrectVisible, wheelVisible, actionsVisible, streakFreezeVisible, leagueVisible, leaderboardVisible, celebratingStage, stage]);

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

  /** Free care action (reference mock: Caress — Free). */
  function handleCaress() {
    if (isDead) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    triggerEmotion('jump', 'happy');
  }

  /** Paid play session (reference mock: Play — 100 points). */
  function handlePlay() {
    if (isDead) return;
    if (balance < ACTION_COSTS.play) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Not enough points',
        `Playing costs ${ACTION_COSTS.play} points.`
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    spendBalance(ACTION_COSTS.play);
    boostHappiness(15);
    addXp(10);
    triggerEmotion('dance', 'happy');
  }

  /** Paid training session (reference mock: Train — 250 points). */
  function handleTrain() {
    if (isDead) return;
    if (balance < ACTION_COSTS.train) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Not enough points',
        `Training costs ${ACTION_COSTS.train} points.`
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    spendBalance(ACTION_COSTS.train);
    boostHappiness(5);
    addXp(25);
    triggerEmotion('spin', 'proud');
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
      } else if (useWalletStore.getState().demoAccount) {
        // Demo accounts (App Store review) revive without the SOL fee.
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
      <ScreenGradient />
      <GestureDetector gesture={sidebarOpenGesture}>
        <View
          style={[
            styles.container,
            {
              paddingHorizontal: horizontalPadding,
            },
          ]}
        >
          {/* HEADER: brand glyph left, device + quests circles right */}
          <Animated.View
            style={styles.topBar}
            entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
          >
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
                style={styles.headerCircleButton}
                accessibilityLabel="Connect device"
              >
                <Ionicons
                  name="bluetooth"
                  size={16}
                  color={ble.connectedDevice ? landing.accent : landing.textMuted}
                />
                <View
                  style={[
                    styles.bleStatusDot,
                    {
                      backgroundColor: ble.connectedDevice
                        ? colors.success
                        : ble.status === 'reconnecting' || ble.status === 'error'
                          ? colors.danger
                          : landing.textMuted,
                    },
                  ]}
                />
              </PressableScale>

              <PressableScale
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setStreakFreezeVisible(true);
                }}
                style={styles.headerStatPill}
                accessibilityLabel={`${streak} day streak, open streak details`}
              >
                <Ionicons name="flame" size={14} color={colors.gold} />
                <Text style={styles.headerStatText}>{streak}</Text>
              </PressableScale>

              <View style={styles.headerStatPill} accessibilityLabel={`${formatNumber(balance)} points`}>
                <Ionicons name="diamond" size={13} color={landing.accent} />
                <Text style={styles.headerStatText}>{formatNumber(balance)}</Text>
              </View>
            </View>
          </Animated.View>

          {/* MAIN CARD */}
          <Animated.View
            style={styles.mainCard}
            entering={FadeInDown.withInitialValues({
              opacity: 0,
              transform: [{ translateY: 12 }],
            })
              .delay(60)
              .duration(380)
              .reduceMotion(ReduceMotion.System)}
          >
            {/* Card header: name / level / XP / happiness */}
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderText}>
                <Text style={styles.petName}>{displayName}</Text>
                <View style={styles.levelRow}>
                  <Text style={styles.levelText}>Lv {level}</Text>
                  <View style={styles.xpTrack}>
                    <View style={[styles.xpFill, { width: `${xpPercent}%` }]} />
                  </View>
                  <Text style={styles.xpText}>
                    {xp}/{xpNeeded}
                  </Text>
                </View>
                <View style={styles.happinessRow}>
                  <Ionicons name="heart-outline" size={11} color={colors.heart} />
                  <Text style={styles.happinessText}>
                    {Math.round(happiness)}% happiness
                  </Text>
                </View>
              </View>
            </View>

            {/* Portrait panel */}
            <GradientFill
              colors={gradients.portrait}
              borderRadius={26}
              style={styles.portrait}
            >
              {/* Owned background cosmetic tints the portrait scene. */}
              <View
                style={[
                  styles.portraitSky,
                  { backgroundColor: BACKGROUND_COLORS[background][0] },
                ]}
              />
              <View
                style={[
                  styles.portraitGround,
                  { backgroundColor: BACKGROUND_COLORS[background][1] },
                ]}
              />

              {spinAvailable && !isDead && (
                <PressableScale
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setWheelVisible(true);
                  }}
                  style={styles.spinPill}
                >
                  <Ionicons name="gift" size={12} color={colors.gold} />
                  <Text style={styles.spinPillText}>Spin</Text>
                </PressableScale>
              )}

              {/* Status cluster: feed + mood; the streak and points live in
                  the header pills. */}
              <View style={styles.statusCluster}>
                <PressableScale
                  onPress={openFoodSheet}
                  style={styles.statusClusterButton}
                  accessibilityLabel={`Feed ${displayName}`}
                >
                  <Text style={styles.fruitIcon}>🍎</Text>
                </PressableScale>
                <View style={styles.statusClusterDivider} />
                <View style={styles.statusClusterButton} pointerEvents="none">
                  <Ionicons name="heart" size={15} color={colors.heart} />
                </View>
              </View>

              <View style={styles.petCircle}>
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
                    showChrome={false}
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

              {/* Stage progress band: dots + stage name + countdown anchored
                  to the bottom of the portrait panel, over the ground tint. */}
              <View style={styles.portraitStageBand} pointerEvents="box-none">
                <PetStageProgress />
                <LifeTimerText />
              </View>
            </GradientFill>

            {/* Actions entry — opens the bubbly actions dialog */}
            <PressableScale
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActionsVisible(true);
              }}
              style={styles.actionsEntry}
              accessibilityLabel="Open actions"
              accessibilityRole="button"
            >
              <Ionicons name="paw-outline" size={16} color={landing.accent} />
              <Text style={styles.actionsEntryText}>Actions</Text>
              <Ionicons name="chevron-up" size={14} color={landing.textMuted} />
            </PressableScale>
          </Animated.View>

          {/* STREAK WEEK ROW */}
          <Animated.View
            entering={FadeInDown.withInitialValues({
              opacity: 0,
              transform: [{ translateY: 8 }],
            })
              .delay(160)
              .duration(260)
              .reduceMotion(ReduceMotion.System)}
          >
            <StreakInfo onOpenFreeze={() => setStreakFreezeVisible(true)} />
          </Animated.View>

          {/* LEAGUE / LEADERBOARD */}
          <Animated.View
            style={styles.socialRow}
            entering={FadeInDown.withInitialValues({
              opacity: 0,
              transform: [{ translateY: 8 }],
            })
              .delay(200)
              .duration(260)
              .reduceMotion(ReduceMotion.System)}
          >
            <PressableScale onPress={() => setLeagueVisible(true)} style={styles.socialButton}>
              <Ionicons name="trophy" size={15} color={colors.gold} />
              <Text style={styles.socialButtonText}>League</Text>
            </PressableScale>
            <PressableScale onPress={() => setLeaderboardVisible(true)} style={styles.socialButton}>
              <Ionicons name="podium" size={15} color={colors.amber} />
              <Text style={styles.socialButtonText}>Leaderboard</Text>
            </PressableScale>
          </Animated.View>

          {/* DCA PROMO */}
          <Animated.View
            style={styles.dcaCardWrap}
            entering={FadeInDown.withInitialValues({
              opacity: 0,
              transform: [{ translateY: 8 }],
            })
              .delay(260)
              .duration(260)
              .reduceMotion(ReduceMotion.System)}
          >
            <DCAHome />
          </Animated.View>

          {/* ACTION BAR: icon buttons flanking the big Check in CTA.
              CTA wiring restored from the repo's original action bar
              (commit 2c4aa86): spin if one is claimable, otherwise the
              daily check-in runs through the food sheet (first feed of the
              day = check-in), and once done it's a free caress. */}
          <Animated.View
            style={styles.actionBar}
            entering={FadeInDown.withInitialValues({
              opacity: 0,
              transform: [{ translateY: 8 }],
            })
              .delay(320)
              .duration(260)
              .reduceMotion(ReduceMotion.System)}
          >
            <PressableScale
              onPress={handleCollectibles}
              style={styles.actionBarIcon}
              accessibilityLabel="Open collectibles"
            >
              <Ionicons name="color-palette-outline" size={20} color={landing.text} />
            </PressableScale>

            <PressableScale
              onPress={handleHardware}
              style={styles.actionBarIcon}
              accessibilityLabel="Hardware waitlist"
            >
              <Ionicons name="hardware-chip-outline" size={20} color={landing.text} />
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
                  handleCaress();
                }
              }}
              style={styles.primaryAction}
              accessibilityLabel={
                spinAvailable
                  ? 'Spin the prize wheel'
                  : !isDoneToday
                    ? `Check in ${displayName}`
                    : `Caress ${displayName}`
              }
            >
              <Text style={styles.primaryActionText}>
                {spinAvailable ? 'Spin wheel' : !isDoneToday ? 'Check in' : 'Caress'}
              </Text>
            </PressableScale>

            <PressableScale
              onPress={() => setQuestsVisible(true)}
              style={styles.actionBarIcon}
              accessibilityLabel="Open quests"
            >
              <Ionicons name="flag-outline" size={19} color={landing.text} />
            </PressableScale>

            <PressableScale
              onPress={handleGames}
              style={styles.actionBarIcon}
              accessibilityLabel="Mini-games, coming soon"
            >
              <Ionicons name="game-controller-outline" size={20} color={landing.textMuted} />
              <View style={styles.soonBadge}>
                <Text style={styles.soonBadgeText}>Soon</Text>
              </View>
            </PressableScale>
          </Animated.View>
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

      <ActionsDialog
        visible={actionsVisible}
        onClose={() => setActionsVisible(false)}
        actions={[
          {
            icon: 'hand-left-outline',
            label: 'Caress',
            badge: 'Free',
            badgeVariant: 'free',
            onPress: handleCaress,
          },
          {
            icon: 'restaurant-outline',
            label: 'Treat',
            badge: isDoneToday ? `${ACTION_COSTS.treat}+` : 'Free',
            badgeVariant: isDoneToday ? 'cost' : 'free',
            highlighted: !isDoneToday,
            onPress: openFoodSheet,
            accessibilityLabel: isDoneToday
              ? `Treat ${displayName}, from ${ACTION_COSTS.treat} points`
              : `Check in and feed ${displayName}, free today`,
          },
          {
            icon: 'game-controller-outline',
            label: 'Play',
            badge: `${ACTION_COSTS.play}`,
            onPress: handlePlay,
          },
          {
            icon: 'barbell-outline',
            label: 'Train',
            badge: `${ACTION_COSTS.train}`,
            onPress: handleTrain,
          },
        ]}
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
    backgroundColor: landing.navy,
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
    backgroundColor: landing.glassActive,
    borderWidth: 1,
    borderColor: landing.glassBorderStrong,
    zIndex: 3000,
  },
  exitToastText: {
    color: landing.text,
    fontSize: typography.small,
    fontFamily: fonts.semiBold,
  },

  /* HEADER */
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  appIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerCircleButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: landing.glass,
    borderWidth: 1,
    borderColor: landing.glassBorder,
  },
  bleStatusDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: landing.navy,
  },
  headerStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 40,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: landing.glass,
    borderWidth: 1,
    borderColor: landing.glassBorder,
  },
  headerStatText: {
    color: landing.text,
    fontSize: typography.small,
    fontFamily: fonts.semiBold,
  },

  /* MAIN CARD */
  mainCard: {
    flex: 1,
    width: '100%',
    borderRadius: radius.xl,
    backgroundColor: landing.glassActive,
    borderWidth: 1,
    borderColor: landing.glassBorder,
    overflow: 'hidden',
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  cardHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cardHeaderText: {
    flexShrink: 1,
  },
  petName: {
    color: landing.text,
    fontSize: 18,
    fontFamily: fonts.medium,
    letterSpacing: -0.3,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 3,
  },
  levelText: {
    color: landing.textMuted,
    fontSize: typography.micro,
    fontFamily: fonts.medium,
  },
  xpTrack: {
    width: 70,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: landing.glassBorder,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: landing.accent,
  },
  xpText: {
    color: landing.textMuted,
    fontSize: 10,
    fontFamily: fonts.medium,
  },
  happinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  happinessText: {
    color: landing.textMuted,
    fontSize: typography.micro,
    fontFamily: fonts.medium,
  },
  fruitIcon: {
    fontSize: 20,
  },

  /* PORTRAIT PANEL */
  portrait: {
    flex: 1,
    width: '100%',
    minHeight: 150,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: landing.glassBorder,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    // Lifts the pet circle clear of the stage-progress band at the bottom.
    paddingBottom: 100,
  },
  portraitSky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '65%',
    opacity: 0.7,
  },
  portraitGround: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '28%',
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
  },
  statusCluster: {
    position: 'absolute',
    top: 11,
    right: 11,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: landing.glass,
    borderWidth: 1,
    borderColor: landing.glassBorder,
    zIndex: 5,
  },
  statusClusterButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusClusterDivider: {
    width: 1,
    height: 20,
    backgroundColor: landing.glassBorder,
  },
  spinPill: {
    position: 'absolute',
    top: 11,
    left: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: landing.glassActive,
    borderWidth: 1,
    borderColor: 'rgba(233,184,70,0.45)',
    zIndex: 5,
  },
  spinPillText: {
    color: landing.text,
    fontSize: 10,
    fontFamily: fonts.semiBold,
  },
  petCircle: {
    width: '62%',
    aspectRatio: 1,
    maxWidth: 240,
    maxHeight: 240,
    borderRadius: radius.pill,
    backgroundColor: landing.navy,
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
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(248,180,60,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,180,60,0.32)',
    zIndex: 5,
  },
  guardianText: {
    color: colors.amber,
    fontSize: 10,
    fontFamily: fonts.semiBold,
  },

  /* STAGE PROGRESS BAND (bottom of the portrait panel) */
  portraitStageBand: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    zIndex: 3,
  },
  lifeTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  lifeTimerText: {
    color: landing.textMuted,
    fontSize: typography.micro,
    fontFamily: fonts.medium,
  },

  /* ACTIONS ENTRY (opens ActionsDialog) */
  actionsEntry: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: landing.glass,
    borderWidth: 1,
    borderColor: landing.glassBorder,
  },
  actionsEntryText: {
    color: landing.eyebrow,
    fontSize: typography.micro,
    fontFamily: fonts.medium,
    letterSpacing: tracking.eyebrow,
    textTransform: 'uppercase',
  },

  /* SOCIAL ROW */
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
    minHeight: 44,
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: landing.frostSurface,
    borderWidth: 1,
    borderColor: landing.frostBorder,
  },
  socialButtonText: {
    fontSize: typography.micro,
    fontFamily: fonts.semiBold,
    color: landing.ink,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: landing.glassActive,
    borderWidth: 1,
    borderColor: landing.glassBorderStrong,
  },
  actionBarIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: landing.glass,
    borderWidth: 1,
    borderColor: landing.glassBorder,
  },
  primaryAction: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: landing.accent,
    paddingHorizontal: spacing.lg,
  },
  primaryActionText: {
    color: landing.onAccent,
    fontSize: typography.body,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.2,
  },
  soonBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: landing.accent,
  },
  soonBadgeText: {
    color: landing.onAccent,
    fontSize: 9,
    fontFamily: fonts.semiBold,
  },
});
