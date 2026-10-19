import AsyncStorage from '@react-native-async-storage/async-storage';

// Reported bug: closing the app mid-workout loses all logged progress —
// WorkoutScreen.tsx's `exercises` (per-set reps/weight/effort) only ever
// lived in React component state, which an app kill wipes entirely. Same
// root cause, less obviously, for just switching to the Workout tab's
// "History" segment and back: WorkoutTabScreen.tsx conditionally renders
// WorkoutScreen rather than hiding it, so that's a real unmount+remount
// too, not just a tab switch.
//
// This persists the one in-progress session a trainee can have at a time
// (the app already enforces "only one workout active at once" — see
// WorkoutScreen.tsx's `sessionActive` lock) to on-device storage that
// survives both of those. Scoped per trainee id, not per workout — there's
// never more than one in-progress session to restore.

export interface SavedSetLog {
  reps: string;
  weight: string;
  effort: number | null;
}

// Mirrors WorkoutScreen.tsx's own RestTimerState exactly — kept as a
// separate type here rather than importing that one, since it's a private
// interface in that screen file, not exported.
export interface SavedRestTimer {
  exerciseId: string;
  exerciseName: string;
  setIndex: number;
  endAt: number;
  totalSeconds: number;
}

export interface SavedWorkoutProgress {
  workoutId: string;
  // Device-local YYYY-MM-DD at the moment this was saved — a workout
  // resets its completion lock at local midnight, so a save from a
  // previous day is stale and must never be silently resurrected into
  // "today's" session.
  dateStr: string;
  setsByExerciseId: Record<string, SavedSetLog[]>;
  // A running rest countdown, if one was active — reported bug: just
  // closing the app screen (backgrounding, or switching to the Workout
  // tab's History segment and back) reset it to nothing instead of
  // continuing. `endAt` is a real epoch timestamp, so restoring it is
  // correct by construction — if the rest period already elapsed while
  // the app was away, the restore just won't apply (see WorkoutScreen.tsx),
  // same as if the trainee had been staring at the screen the whole time.
  restTimer: SavedRestTimer | null;
}

function storageKey(userId: string): string {
  return `athera_workout_progress_${userId}`;
}

// Every function here is fire-and-forget at its call sites by design — a
// save/load/clear failure (storage full, corrupted JSON, etc.) should
// never block or crash the actual workout-logging UI, just mean progress
// isn't recoverable this one time.

export async function saveWorkoutProgress(userId: string, progress: SavedWorkoutProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(progress));
  } catch (e) {
    console.warn('saveWorkoutProgress failed', e);
  }
}

export async function loadWorkoutProgress(userId: string): Promise<SavedWorkoutProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as SavedWorkoutProgress;
  } catch (e) {
    console.warn('loadWorkoutProgress failed', e);
    return null;
  }
}

export async function clearWorkoutProgress(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch (e) {
    console.warn('clearWorkoutProgress failed', e);
  }
}
