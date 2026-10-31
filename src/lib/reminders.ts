// Local notifications before documents expire. Nothing leaves the phone: the
// reminders are scheduled with the OS and rebuilt from the vault on each save.

import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';

import { EXPIRY_WARNING_DAYS, formatBrDate, localDate } from './dates';
import type { Item } from './types';

const CHANNEL_ID = 'expiry';
const REMINDER_HOUR = 9;
const DAY_MS = 86_400_000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Vencimento de documentos',
    importance: AndroidImportance.DEFAULT,
  });
}

function granted(p: Notifications.NotificationPermissionsStatus) {
  return p.granted || p.ios?.status === IosAuthorizationStatus.PROVISIONAL;
}

/** Asks for notification permission if it wasn't asked yet. Returns whether reminders can be shown. */
export async function requestReminderPermission(): Promise<boolean> {
  await ensureChannel(); // Android 13+ only shows the prompt once a channel exists
  const current = await Notifications.getPermissionsAsync();
  if (granted(current)) return true;
  if (!current.canAskAgain) return false;
  return granted(await Notifications.requestPermissionsAsync());
}

let queue: Promise<unknown> = Promise.resolve();

/** Replaces every scheduled reminder with ones for the current items. */
export function syncReminders(items: Item[]): Promise<void> {
  const run = queue.then(async () => {
    const permission = await Notifications.getPermissionsAsync();
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!granted(permission)) return;
    await ensureChannel();
    const now = Date.now();
    for (const item of items) {
      if (!item.expiresOn) continue;
      const expiry = localDate(item.expiresOn, REMINDER_HOUR);
      const when = formatBrDate(item.expiresOn);
      const reminders = [
        {
          date: new Date(expiry.getTime() - EXPIRY_WARNING_DAYS * DAY_MS),
          body: `${item.title} vence em ${EXPIRY_WARNING_DAYS} dias (${when}).`,
        },
        { date: expiry, body: `${item.title} vence hoje (${when}).` },
      ];
      for (const { date, body } of reminders) {
        if (date.getTime() <= now) continue;
        await Notifications.scheduleNotificationAsync({
          content: { title: 'Documento vencendo', body, data: { itemId: item.id } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
        });
      }
    }
  });
  queue = run.catch(() => {});
  return run;
}
