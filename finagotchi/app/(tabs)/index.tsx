import React from 'react';

import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PetCanvas } from '../../src/components/PetCanvas';
import { StreakBadge } from '../../src/components/StreakBadge';
import { useCheckinStore } from '../../src/features/checkin/store';
import { colors, spacing } from '../../src/theme/tokens';

export default function HomeScreen() {
  const streak = useCheckinStore(
    (state) => state.streak
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.logo}>
          Finagotchi
        </Text>

        <Text style={styles.subtitle}>
          Your financial journey. Your pet.
        </Text>

        <PetCanvas />

        <StreakBadge streak={streak} />

        <View style={styles.message}>
          <Text style={styles.messageTitle}>
            Keep your pet growing 🌱
          </Text>

          <Text style={styles.messageText}>
            Save today and keep your streak alive.
          </Text>
        </View>
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
    padding: spacing.lg,
    alignItems: 'center',
  },

  logo: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '900',
  },

  subtitle: {
    color: colors.primary,
    marginTop: 4,
    marginBottom: spacing.md,
  },

  message: {
    width: '100%',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },

  messageTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },

  messageText: {
    color: colors.textMuted,
    marginTop: 6,
  },
});