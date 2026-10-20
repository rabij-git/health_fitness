import type * as NotificationsType from 'expo-notifications';
import { Platform, AppState, Linking } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// Lets a trainee know their rest period is over even if they've left the app
// (checking email, social media, etc.) during rest — expo-audio alone can't
// do this, since real background audio playback requires the iOS "audio"
// background mode + Android foreground-service audio, neither of which
// Expo Go can declare. A scheduled *local* notification is the standard
// workaround: the OS delivers it (with sound) on its own, no JS needs to be
// running in the background at all.
//
// IMPORTANT: the custom tick sound only actually plays via a dev-client/EAS
// build — Expo Go can't register a custom notification sound reliably. In
// Expo Go on iOS the notification itself still fires, just with the default
// system sound. After changing app.json's `expo-notifications` plugin
// config (the bundled `sounds` array), a full native rebuild is required —
// a Metro-only reload won't pick up native/plugin config changes.
//
// IMPORTANT (Android): merely IMPORTING expo-notifications crashes the app
// on Android inside Expo Go — its own module-level setup code registers a
// push-token listener automatically, and since SDK 53 Expo Go on Android
// throws (not warns) the moment anything touches push/remote-notification
// registration: "Android Push notifications (remote notifications)
// functionality provided by expo-notifications was removed from Expo Go...
// Use a development build instead." This happens even though this file only
// ever uses LOCAL scheduled notifications, nothing push/remote — Expo Go's
// check doesn't distinguish. A static top-level `import` would always
// evaluate regardless of any runtime guard placed after it, so the actual
// module is loaded lazily via `require()` instead, skipped entirely in this
// one specific environment (Android + Expo Go) — see getNotifications()
// below. Every exported function here degrades to a harmless no-op in that
// case rather than crashing.

const REST_CHANNEL_ID = 'rest-timer';
const TICK_SOUND_FILE = 'tick.wav';

const isExpoGoAndroid =
  Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let notificationsModule: typeof NotificationsType | null | undefined;

function getNotifications(): typeof NotificationsType | null {
  if (isExpoGoAndroid) return null;
  if (notificationsModule === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    notificationsModule = require('expo-notifications') as typeof NotificationsType;
  }
  return notificationsModule;
}

// This module owns the app's single global notification handler — only one
// can be registered at a time (a second call elsewhere would silently
// replace this one), so achievement notifications (below) are handled here
// too rather than in a separate file with its own handler.
//
// While the app is genuinely foregrounded, WorkoutScreen's own in-app rest
// banner + in-app tick sound already cover a REST notification — suppress
// its system banner/sound there to avoid a redundant double-alert.
// Backgrounded is the whole point of that feature, so it shows and plays
// normally there. ACHIEVEMENT notifications have no equivalent persistent
// in-app banner (just a one-time completion modal), so they always show,
// foregrounded or not. Content is tagged with `data.type` so this one
// shared handler can tell the two apart. No-op on Expo Go Android — see above.
const NotificationsForHandler = getNotifications();
if (NotificationsForHandler) {
  NotificationsForHandler.setNotificationHandler({
    handleNotification: async notification => {
      const foregrounded = AppState.currentState === 'active';
      const isRest = notification.request.content.data?.type === 'rest';
      const suppress = foregrounded && isRest;
      return {
        shouldShowBanner: !suppress,
        shouldShowList: !suppress,
        shouldPlaySound: !suppress,
        shouldSetBadge: false,
      };
    },
  });
}

let permissionDeniedThisSession = false;

async function ensurePermission(Notifications: typeof NotificationsType): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  // Don't re-prompt on every single rest period after the trainee's said no once.
  if (permissionDeniedThisSession) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') permissionDeniedThisSession = true;
  return status === 'granted';
}

// Reported bug: rest-timer alerts don't fire once the trainee leaves the app
// or locks the phone. Two real, separate causes found — see CLAUDE.md for
// the Android-side fix (`android.permission.SCHEDULE_EXACT_ALARM` in
// app.json — confirmed by reading expo-notifications' own native scheduler,
// which silently falls back to an inexact, Doze-delayable alarm without it;
// a manifest/native-build change this module can't do anything about at
// runtime). The other cause this module CAN help recover from: once a
// trainee denies the permission prompt
// (or it carried over denied from an earlier install — Android does not
// reset a previously-denied permission just because the app was updated,
// only a full uninstall/reinstall resets it), `ensurePermission` above
// stops re-prompting for the rest of that session, same as before, but
// there was previously no way for the trainee to ever revisit that
// decision from inside the app. These two exports back a small "Rest Timer
// Alerts" status row (ProfileScreen.tsx) so a denied/never-asked state is
// visible and fixable, instead of silently never alerting again.
export type RestNotificationPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export async function getRestNotificationPermissionStatus(): Promise<RestNotificationPermissionStatus> {
  const Notifications = getNotifications();
  if (!Notifications) return 'unavailable';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch (e) {
    return 'unavailable';
  }
}

// Only actually shows a system prompt the first time (iOS/Android both
// refuse to re-prompt after a denial) — calling this again once already
// denied just immediately resolves to the same denied status with no UI;
// the caller should fall back to opening Settings instead in that case
// (see openNotificationSettings below).
export async function requestRestNotificationPermission(): Promise<RestNotificationPermissionStatus> {
  const Notifications = getNotifications();
  if (!Notifications) return 'unavailable';
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  if (status !== 'granted') permissionDeniedThisSession = true;
  else permissionDeniedThisSession = false;
  return status;
}

// Reported: the rest-timer alert fires fine while the trainee has merely
// switched to a different app (screen still on), but never arrives once the
// phone is actually locked — even with notification permission granted and
// android.permission.SCHEDULE_EXACT_ALARM declared in app.json. Root cause:
// Android 14 (API 34) tightened this specific permission so that declaring
// it in the manifest is no longer enough to auto-grant it for most apps
// (a deliberate policy change aimed at apps overusing exact alarms) — the
// user now has to explicitly flip "Alarms & reminders" on for this app via
// Settings, the same one-time grant a real alarm-clock app would need.
// There's no JS-readable status for this specific permission (expo-notifications'
// own `getPermissionsAsync()` android fields only cover importance/interruption
// filter, nothing about exact alarms), so unlike the notification-permission
// card above, this can't be conditionally hidden once already granted — it's
// shown unconditionally on Android as a "if alerts don't arrive while locked,
// check this" action rather than a status readout.
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    // No data URI support via Linking.sendIntent (RN's Android bridge only
    // forwards action + extras, not an Intent's `data`), so this may land on
    // a general "Alarms & reminders" list of every app requesting it rather
    // than jumping straight to this app's own toggle — still gets the
    // trainee to the right screen, just possibly one tap further.
    await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
  } catch (e) {
    console.warn('openExactAlarmSettings failed', e);
  }
}

let androidChannelReady = false;

async function ensureAndroidChannel(Notifications: typeof NotificationsType) {
  if (Platform.OS !== 'android' || androidChannelReady) return;
  await Notifications.setNotificationChannelAsync(REST_CHANNEL_ID, {
    name: 'Rest Timer',
    importance: Notifications.AndroidImportance.HIGH,
    sound: TICK_SOUND_FILE,
    vibrationPattern: [0, 250, 250, 250],
  });
  androidChannelReady = true;
}

// Schedules a local notification for when a rest period ends. Returns the
// notification id (for cancelling early), or null if permission was denied,
// the countdown has already elapsed, or notifications aren't available in
// this environment (Expo Go on Android).
export async function scheduleRestEndNotification(exerciseName: string, secondsFromNow: number): Promise<string | null> {
  if (secondsFromNow <= 0) return null;
  const Notifications = getNotifications();
  if (!Notifications) return null;
  const granted = await ensurePermission(Notifications);
  if (!granted) return null;
  await ensureAndroidChannel(Notifications);
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest complete',
        body: `Time for your next set — ${exerciseName}`,
        // Android's sound lives on the channel (set above), not here.
        sound: Platform.OS === 'ios' ? TICK_SOUND_FILE : undefined,
        data: { type: 'rest' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsFromNow,
        channelId: REST_CHANNEL_ID,
      },
    });
  } catch (e) {
    console.warn('scheduleRestEndNotification failed', e);
    return null;
  }
}

const ACHIEVEMENT_CHANNEL_ID = 'achievements';
let achievementChannelReady = false;

async function ensureAchievementChannel(Notifications: typeof NotificationsType) {
  if (Platform.OS !== 'android' || achievementChannelReady) return;
  await Notifications.setNotificationChannelAsync(ACHIEVEMENT_CHANNEL_ID, {
    name: 'Achievements',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 150, 100, 150],
  });
  achievementChannelReady = true;
}

// Fires immediately (trigger: null, not scheduled) when one or more medals
// are newly earned — previously the only feedback was the one-time
// "Workout Complete" modal, which only shows the first medal if several
// were earned at once and is easy to miss if the trainee doesn't linger on
// it. No-op if notifications aren't available (Expo Go on Android) or
// permission was denied — the in-app modal still covers that case.
export async function notifyMedalsEarned(medalNames: string[]): Promise<void> {
  if (medalNames.length === 0) return;
  const Notifications = getNotifications();
  if (!Notifications) return;
  const granted = await ensurePermission(Notifications);
  if (!granted) return;
  await ensureAchievementChannel(Notifications);
  const title = medalNames.length === 1 ? '🏅 Achievement Unlocked!' : `🏅 ${medalNames.length} Achievements Unlocked!`;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: medalNames.join(', '),
        data: { type: 'achievement' },
      },
      // ChannelAwareTriggerInput ({ channelId }) still delivers immediately
      // (per its own doc comment) — it just also pins the Android channel,
      // which a bare `null` trigger can't do.
      trigger: Platform.OS === 'android' ? { channelId: ACHIEVEMENT_CHANNEL_ID } : null,
    });
  } catch (e) {
    console.warn('notifyMedalsEarned failed', e);
  }
}

// Reuses the achievement channel (same importance/behavior — no "rest"
// suppression applies, since only the 'rest' type is suppressed while
// foregrounded, see the shared handler above) for any other new-activity
// notification: a chat message, a connect request, a trainee accepting
// one, a new workout/nutrition-plan assignment. Fires immediately, same
// as notifyMedalsEarned — these are one-off events with no persistent
// in-app banner of their own, so they always show, foregrounded or not.
export async function notifyNewActivity(title: string, body: string): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  const granted = await ensurePermission(Notifications);
  if (!granted) return;
  await ensureAchievementChannel(Notifications);
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { type: 'activity' } },
      trigger: Platform.OS === 'android' ? { channelId: ACHIEVEMENT_CHANNEL_ID } : null,
    });
  } catch (e) {
    console.warn('notifyNewActivity failed', e);
  }
}

export async function cancelRestEndNotification(id: string | null) {
  if (!id) return;
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (e) {
    // Already fired, or already cancelled — nothing to do.
  }
}
