import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'finagotchi-daily-reminders';

export async function requestNotificationPermissions(): Promise<boolean> {
    const { status: existingStatus } =
        await Notifications.getPermissionsAsync();

    if (existingStatus === 'granted') {
        return true;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
}

export async function ensureNotificationChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;

    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Daily reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#72E45A',
    });
}

export async function cancelAllScheduledNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleDailyReminder(
    hour: number,
    minute: number
): Promise<string | null> {
    await ensureNotificationChannel();

    await Notifications.cancelAllScheduledNotificationsAsync();

    const identifier = await Notifications.scheduleNotificationAsync({
        content: {
            title: 'Your pet is waiting',
            body: 'Did you stick to your plan today?',
            sound: true,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
            channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
        } satisfies Notifications.DailyTriggerInput,
    });

    return identifier;
}

export async function scheduleLastChanceReminder(): Promise<string | null> {
    await ensureNotificationChannel();

    const identifier = await Notifications.scheduleNotificationAsync({
        content: {
            title: 'Last chance to check in',
            body: 'Your streak is on the line. Tap to keep it alive!',
            sound: true,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 23,
            minute: 0,
            channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
        } satisfies Notifications.DailyTriggerInput,
    });

    return identifier;
}

export async function scheduleStreakDangerReminder(
    streak: number
): Promise<string | null> {
    await ensureNotificationChannel();

    const identifier = await Notifications.scheduleNotificationAsync({
        content: {
            title: `${streak}-day streak at risk 🔥`,
            body: 'You worked hard for this. One tap keeps it alive.',
            sound: true,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 20,
            minute: 0,
            channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
        } satisfies Notifications.DailyTriggerInput,
    });

    return identifier;
}

export async function scheduleNeglectWarning(): Promise<string | null> {
    await ensureNotificationChannel();

    const identifier = await Notifications.scheduleNotificationAsync({
        content: {
            title: 'Your Finny is starving',
            body: 'Feed within the hour or your NFT will be burned forever.',
            sound: true,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 22,
            minute: 30,
            channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
        } satisfies Notifications.DailyTriggerInput,
    });

    return identifier;
}

export async function scheduleReviveReminder(): Promise<string | null> {
    await ensureNotificationChannel();

    const identifier = await Notifications.scheduleNotificationAsync({
        content: {
            title: 'Your NFT is gone 💀',
            body: 'Caretakers who revive now keep their rank. Wait and lose everything.',
            sound: true,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 12,
            minute: 0,
            channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
        } satisfies Notifications.DailyTriggerInput,
    });

    return identifier;
}

export async function scheduleAllDarkPatternReminders(
    streak: number
): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await scheduleDailyReminder(19, 0);
    await scheduleStreakDangerReminder(streak);
    await scheduleNeglectWarning();
    await scheduleLastChanceReminder();
}
