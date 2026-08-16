import React from 'react';
import { Tabs } from 'expo-router';

import { colors } from '../../src/theme/tokens';

export default function TabLayout() {
    return (
        <Tabs
        screenOptions={{
            headerShown: false,

            tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            },

            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
        }}
        >
        <Tabs.Screen
            name="index"
            options={{
            title: 'Pet',
            tabBarIcon: () => '🐣',
            }}
        />

        <Tabs.Screen
            name="checkin"
            options={{
            title: 'Check-in',
            tabBarIcon: () => '🔥',
            }}
        />

        <Tabs.Screen
            name="companion"
            options={{
            title: 'Wallet',
            tabBarIcon: () => '◎',
            }}
        />

        <Tabs.Screen
            name="settings"
            options={{
            title: 'Settings',
            tabBarIcon: () => '⚙️',
            }}
        />
        </Tabs>
    );
}