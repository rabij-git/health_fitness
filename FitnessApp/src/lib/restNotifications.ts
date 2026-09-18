import type * as NotificationsType from 'expo-notifications';
import { Platform, AppState } from 'react-native';
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

// While the app is genuinely foregrounded, WorkoutScreen's own in-app rest
// banner + in-app tick sound already cover this (see WorkoutScreen.tsx) —
// suppress the system notification's banner/sound there to avoid a
// redundant double-alert. Backgrounded is the whole point of this feature,
// so it shows and plays normally there. No-op on Expo Go Android — see above.
const NotificationsForHandler = getNotifications();
if (NotificationsForHandler) {
  NotificationsForHandler.setNotificationHandler({
    handleNotification: async () => {
      const foregrounded = AppState.currentState === 'active';
      return {
        shouldShowBanner: !foregrounded,
        shouldShowList: !foregrounded,
        shouldPlaySound: !foregrounded,
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
