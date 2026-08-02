import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export type NotificationPermissionState = {
  granted: boolean;
  canAskAgain: boolean;
  status: Notifications.PermissionStatus;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function prepareNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('airing-reminders', {
    name: 'Airing reminders',
    description: 'Optional alerts shortly before saved anime episodes air.',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#E43D5C',
  });
}

function normalizePermission(response: Notifications.NotificationPermissionsStatus): NotificationPermissionState {
  return { granted: response.granted, canAskAgain: response.canAskAgain, status: response.status };
}

export async function getNotificationPermissionState() {
  await prepareNotificationChannel();
  return normalizePermission(await Notifications.getPermissionsAsync());
}

export async function requestNotificationPermission() {
  await prepareNotificationChannel();
  return normalizePermission(await Notifications.requestPermissionsAsync());
}

export function openAppPermissionSettings() {
  return Linking.openSettings();
}
