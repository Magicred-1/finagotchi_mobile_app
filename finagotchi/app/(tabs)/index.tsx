import React, { useState } from 'react';
import {
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';

import { PetCanvas } from '../../src/components/PetCanvas';
import { Button } from '../../src/components/Button';
import { useCheckinStore } from '../../src/features/checkin/store';
import { usePetStore } from '../../src/features/pet/store';
import { colors, spacing } from '../../src/theme/tokens';

const STAGE_NAMES = {
  1: 'Baby • Stage 1',
  2: 'Coinling • Stage 2',
  3: 'Hodler • Stage 3',
} as const;

export default function HomeScreen() {
  const [complete, setComplete] = useState(false);

  const checkIn = useCheckinStore((state) => state.checkIn);
  const hasCheckedInToday = useCheckinStore((state) =>
    state.hasCheckedInToday()
  );
  const streak = useCheckinStore((state) => state.streak);
  const stage = usePetStore((state) => state.stage);

  const isDoneToday = complete || hasCheckedInToday;

  function handleCheckin(saved: boolean) {
    const success = checkIn(saved);
    if (success) {
      setComplete(true);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
        scrollEventThrottle={16}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>WELCOME BACK</Text>
            <Text style={styles.title}>Your Finagotchi</Text>
          </View>

          <View style={styles.headerRight}>
            <View style={styles.headerStreak}>
              <Text style={styles.fireEmoji}>🔥</Text>
              <Text style={styles.headerStreakText}>{streak}</Text>
            </View>

          </View>
        </View>

        {/* Hero Card */}
        <View style={styles.hero}>
          <View style={styles.heroGlow} />

          <Image
            source={require('../../assets/logos/finagotchi_logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          {/* Pet Container (Auto-sized, no fixed heights to cause overflow) */}
          <View style={styles.petSection}>
            <View pointerEvents="none">
              <PetCanvas />
            </View>
            <Text style={styles.petName}>Finny</Text>
            <Text style={styles.petStage}>
              {STAGE_NAMES[stage] ?? STAGE_NAMES[1]}
            </Text>
          </View>

          {/* Check-In Controls */}
          {!isDoneToday ? (
            <View style={styles.checkinContainer}>
              <Text style={styles.checkinQuestion}>Did you save today?</Text>
              <View style={styles.buttonGroup}>
                <Button
                  title="YES — I SAVED 💚"
                  onPress={() => handleCheckin(true)}
                />
                <Button
                  title="NO — NOT TODAY"
                  onPress={() => handleCheckin(false)}
                />
              </View>
            </View>
          ) : (
            <View style={styles.successBanner}>
              <Text style={styles.successEmoji}>🌱</Text>
              <View style={styles.successTextContainer}>
                <Text style={styles.successTitle}>Check-in complete!</Text>
                <Text style={styles.successSubtitle}>
                  Nice work. Finny is proud of you.
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Progress Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Finny's Evolution</Text>
            <Text style={styles.progressPercent}>72%</Text>
          </View>

          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>

          <View style={styles.evolutionRow}>
            <View style={styles.evolutionStep}>
              <Text style={styles.evolutionEmoji}>🥚</Text>
              <Text style={styles.evolutionName}>Baby</Text>
              <Text style={styles.evolutionDays}>Start</Text>
            </View>

            <View style={styles.evolutionLine} />

            <View style={styles.evolutionStep}>
              <Text style={styles.evolutionEmoji}>🐣</Text>
              <Text
                style={[
                  styles.evolutionName,
                  stage >= 2 && styles.activeStageText,
                ]}
              >
                Coinling
              </Text>
              <Text style={styles.evolutionDays}>7 days</Text>
            </View>

            <View style={styles.evolutionLine} />

            <View style={styles.evolutionStep}>
              <Text style={styles.evolutionEmoji}>🐹</Text>
              <Text
                style={[
                  styles.evolutionName,
                  stage >= 3 && styles.activeStageText,
                ]}
              >
                Hodler
              </Text>
              <Text style={styles.evolutionDays}>30 days</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footerHint}>
          You don't need a perfect day.{'\n'}You just need to keep showing up.
        </Text>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },

  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  /* Header */
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },

  eyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: 'Poppins_700Bold',
  },

  title: {
    marginTop: 2,
    color: colors.text,
    fontSize: 22,
    fontFamily: 'Poppins_800ExtraBold',
  },

  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  headerStreak: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 150, 70, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 150, 70, 0.25)',
    gap: 4,
  },

  fireEmoji: {
    fontSize: 14,
  },

  headerStreakText: {
    color: colors.text,
    fontSize: 14,
    fontFamily: 'Poppins_700Bold',
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  avatarText: {
    color: colors.primary,
    fontSize: 16,
    fontFamily: 'Poppins_800ExtraBold',
  },

  /* Hero */
  hero: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: spacing.md,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },

  heroGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    top: 20,
    borderRadius: 110,
    backgroundColor: 'rgba(93, 226, 166, 0.08)',
  },

  logo: {
    width: 130,
    height: 36,
  },

  petSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },

  petName: {
    marginTop: 4,
    color: colors.text,
    fontSize: 20,
    fontFamily: 'Poppins_800ExtraBold',
  },

  petStage: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },

  /* Check-in Actions */
  checkinContainer: {
    width: '100%',
    marginTop: 10,
    alignItems: 'center',
  },

  checkinQuestion: {
    color: colors.text,
    fontSize: 15,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 10,
  },

  buttonGroup: {
    width: '100%',
    gap: 8,
  },

  successBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(93, 226, 166, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(93, 226, 166, 0.2)',
    padding: 14,
    borderRadius: 16,
    marginTop: 10,
    gap: 12,
  },

  successEmoji: {
    fontSize: 26,
  },

  successTextContainer: {
    flex: 1,
  },

  successTitle: {
    color: colors.text,
    fontSize: 14,
    fontFamily: 'Poppins_700Bold',
  },

  successSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
  },

  /* Progress Card */
  progressCard: {
    width: '100%',
    marginTop: spacing.md,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  progressTitle: {
    color: colors.text,
    fontSize: 14,
    fontFamily: 'Poppins_700Bold',
  },

  progressPercent: {
    color: colors.primary,
    fontSize: 15,
    fontFamily: 'Poppins_800ExtraBold',
  },

  progressTrack: {
    width: '100%',
    height: 8,
    marginTop: 12,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },

  progressFill: {
    width: '72%',
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },

  evolutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },

  evolutionStep: {
    flex: 1,
    alignItems: 'center',
  },

  evolutionEmoji: {
    fontSize: 22,
  },

  evolutionName: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
  },

  activeStageText: {
    color: colors.primary,
  },

  evolutionDays: {
    marginTop: 1,
    color: colors.textMuted,
    fontSize: 9,
    fontFamily: 'Poppins_400Regular',
    opacity: 0.6,
  },

  evolutionLine: {
    width: 16,
    height: 1,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },

  footerHint: {
    marginTop: 20,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
  },

  bottomSpace: {
    height: 20,
  },
});