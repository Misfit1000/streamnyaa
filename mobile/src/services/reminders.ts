import * as Notifications from 'expo-notifications';
import type { ScheduleEntry } from '../types';
import { requestNotificationPermission } from './permissions';

export async function ensureReminderPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await requestNotificationPermission()).granted;
}

export async function scheduleAiringReminder(entry: ScheduleEntry, minutesBefore = 10) {
  if (!(await ensureReminderPermission())) throw new Error('Notification permission is required for reminders.');
  const triggerDate = new Date((entry.airingAt - minutesBefore * 60) * 1000);
  if (triggerDate.getTime() <= Date.now()) throw new Error('This airing time is too close for a reminder.');
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `${entry.anime.title} airs soon`,
      body: `${entry.episode ? `Episode ${entry.episode}` : 'A new episode'} starts in about ${minutesBefore} minutes.`,
      data: { animeId: entry.anime.id, episode: entry.episode },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
  });
}
