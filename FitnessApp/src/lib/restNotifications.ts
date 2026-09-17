import * as Notifications from 'expo-notifications';
import { Platform, AppState } from 'react-native';

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
// Expo Go the notification itself still fires, just with the default system
// sound. After changing app.json's `expo-notifications` plugin config
// (the bundled `sounds` array), a full native rebuild is required — a
// Metro-only reload won't pick up native/plugin config changes.

const REST_CHANNEL_ID = 'rest-timer';
const TICK_SOUND_FILE = 'tick.wav';

// While the app is genuinely foregrounded, WorkoutScreen's own in-app rest
// banner + in-app tick sound already cover this (see WorkoutScreen.tsx) —
// suppress the system notification's banner/sound there to avoid a
// redundant double-alert. Backgrounded is the whole point of this feature,
// so it shows and plays normally there.
Notifications.setNotificationHandler({
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

let permissionDeniedThisSession = false;

async function ensurePermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  // Don't re-prompt on every single rest period after the trainee's said no once.
  if (permissionDeniedThisSession) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') permissionDeniedThisSession = true;
  return status === 'granted';
}

let androidChannelReady = false;

async function ensureAndroidChannel() {
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
// notification id (for cancelling early), or null if permission was denied
// or the countdown has already elapsed.
export async function scheduleRestEndNotification(exerciseName: string, secondsFromNow: number): Promise<string | null> {
  if (secondsFromNow <= 0) return null;
  const granted = await ensurePermission();
  if (!granted) return null;
  await ensureAndroidChannel();
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
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (e) {
    // Already fired, or already cancelled — nothing to do.
  }
}
