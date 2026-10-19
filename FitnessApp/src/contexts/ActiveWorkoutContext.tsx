import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AppState, Vibration } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { Workout, mockMedals } from '../data/mockData';
import {
  getWorkoutsForTrainee,
  getWorkoutWithExercises,
  getWorkoutIdsCompletedToday,
  getProfile,
  startWorkoutSession,
  completeWorkoutSession,
  sendMessage,
  logExerciseWeight,
  todayDateString,
} from '../lib/db';
import { DBWorkout } from '../lib/supabase';
import { scheduleRestEndNotification, cancelRestEndNotification, notifyMedalsEarned } from '../lib/restNotifications';
import { isWorkoutDurationExpired } from '../lib/workoutDuration';
import { saveWorkoutProgress, loadWorkoutProgress, clearWorkoutProgress, SavedWorkoutProgress } from '../lib/workoutProgress';

// Lifted out of WorkoutScreen.tsx (where all of this used to live in local
// component state) and up into a Provider mounted once above TrainerTabs'
// Tab.Navigator — see TrainerTabs.tsx. Two reported bugs drove this:
//
// 1. Switching to the Workout tab's "History" segment and back (or just
//    backgrounding the app) used to lose all in-progress logging. There was
//    already an AsyncStorage backstop (workoutProgress.ts) for a genuine app
//    kill, but WorkoutTabScreen.tsx actually unmounts/remounts WorkoutScreen
//    on every History toggle too — a real remount, not just a hidden tab —
//    so recovery depended on that same disk round-trip succeeding on every
//    single toggle. Keeping the session state here instead means
//    WorkoutScreen can mount/unmount freely (it's now a thin presentational
//    consumer) without ever touching the actual session data.
// 2. The rest timer needs to be visible on OTHER tabs while it's running,
//    which is only possible if it lives above the tab navigator in the
//    first place (see RestTimerBanner.tsx, rendered once in TrainerTabs.tsx).
//
// The AsyncStorage layer (workoutProgress.ts) stays as-is and is still the
// only thing that survives an actual app kill — this Provider is still just
// in-memory React state, gone the moment the JS context is destroyed.

function isScheduledForToday(workout: DBWorkout): boolean {
  if (!workout.scheduled_days || workout.scheduled_days.length === 0) return true;
  return workout.scheduled_days.includes(new Date().getDay());
}

export interface SetLog {
  reps: string;
  weight: string;
  effort: number | null;
}

export interface ExerciseLog {
  id: string;
  name: string;
  coachSets: number;
  coachReps: string;
  coachWeight?: string;
  coachTime?: string;
  restSeconds?: number;
  laterality?: 'single_arm' | 'single_leg' | null;
  completed: boolean;
  sets: SetLog[];
}

export interface RestTimerState {
  exerciseId: string;
  exerciseName: string;
  setIndex: number;
  // Countdown to a fixed end timestamp rather than a decrementing counter —
  // RN fully suspends JS timers while the app is backgrounded, so a
  // decrement-per-tick counter just stops advancing and "freezes" until the
  // app resumes. Deriving the remaining time from Date.now() instead means
  // the moment the app comes back to the foreground, the display jumps
  // straight to the correct real-elapsed value instead of resuming from
  // wherever it was paused.
  endAt: number;
  totalSeconds: number;
}

function buildInitialExercises(workout: Workout): ExerciseLog[] {
  return workout.exercises.map((ex) => ({
    id: ex.id,
    name: ex.name,
    coachSets: ex.sets,
    coachReps: ex.reps,
    coachWeight: ex.weight,
    coachTime: ex.time,
    restSeconds: ex.restSeconds,
    laterality: ex.laterality,
    completed: false,
    // A real per-set breakdown (e.g. a lighter warm-up set before heavier
    // working sets) means each row targets its own reps/weight, not the
    // same exercise-level value repeated — falls back to the old
    // repeat-one-value behavior for exercises assigned before this existed.
    sets: ex.setDetails && ex.setDetails.length > 0
      ? ex.setDetails.map(sd => ({ reps: sd.reps, weight: sd.weight ?? '', effort: null }))
      : Array.from({ length: ex.sets }, () => ({
          reps: ex.reps,
          weight: ex.weight ?? '',
          effort: null,
        })),
  }));
}

interface ActiveWorkoutValue {
  // Workout list
  workouts: DBWorkout[];
  loadingWorkouts: boolean;
  isPending: boolean;
  completedTodayIds: Set<string>;
  toDoWorkouts: DBWorkout[];
  completedTodayWorkouts: DBWorkout[];
  notTodayWorkouts: DBWorkout[];
  durationEndedWorkouts: DBWorkout[];
  pastWorkouts: DBWorkout[];
  selectedWorkoutMeta: DBWorkout | null;

  // Selected workout detail
  selectedWorkoutId: string | null;
  setSelectedWorkoutId: (id: string | null) => void;
  dbWorkout: Workout | null;
  loadingDetail: boolean;
  exercises: ExerciseLog[];
  submitted: boolean;
  showMedal: boolean;
  setShowMedal: (v: boolean) => void;
  modalXp: number;
  modalIsComplete: boolean;
  newlyEarnedMedalIds: string[];

  // Derived
  completedCount: number;
  totalSets: number;
  loggedSets: number;
  progress: number;
  isFullyComplete: boolean;
  activeExerciseIndex: number;
  sessionActive: boolean;

  // Rest timer
  restTimer: RestTimerState | null;
  restSecondsLeft: number;
  skipRestTimer: () => void;

  // Actions
  setEffort: (exerciseId: string, setIndex: number, level: number) => void;
  reorderExercise: (exerciseId: string, direction: 'up' | 'down') => void;
  handleSubmit: () => Promise<void>;
}

const ActiveWorkoutContext = createContext<ActiveWorkoutValue | null>(null);

export function useActiveWorkout(): ActiveWorkoutValue {
  const ctx = useContext(ActiveWorkoutContext);
  if (!ctx) throw new Error('useActiveWorkout must be used within an ActiveWorkoutProvider');
  return ctx;
}

export function ActiveWorkoutProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  // ── Workout list ──
  const [workouts, setWorkouts] = useState<DBWorkout[]>([]);
  const [completedTodayIds, setCompletedTodayIds] = useState<Set<string>>(new Set());
  const [loadingWorkouts, setLoadingWorkouts] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);

  // Recovers an in-progress session the one time this Provider mounts (app
  // launch / login) from on-device storage — see workoutProgress.ts.
  // `pendingRestoreRef` holds a saved session once found, until the
  // exercise-detail effect below consumes it.
  const pendingRestoreRef = useRef<SavedWorkoutProgress | null>(null);
  const triedAutoSelectRef = useRef(false);

  // This Provider lives for the whole trainee session (mounted once above
  // the Tab.Navigator, never torn down by a tab switch), so a plain
  // useEffect — not useFocusEffect — is the right tool: there's no
  // enclosing Screen/NavigationContext at this level to hook a focus event
  // off of in the first place (TrainerTabs.tsx's own function body, which is
  // where this Provider wraps the Tab.Navigator, isn't itself inside one —
  // only its Tab.Screen children are).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const profile = await getProfile(userId);
      if (cancelled) return;
      if (!profile) { setLoadingWorkouts(false); return; }
      if (profile.status === 'pending') { setIsPending(true); setLoadingWorkouts(false); return; }
      setIsPending(false);
      const [list, completedIds, saved] = await Promise.all([
        getWorkoutsForTrainee(userId),
        getWorkoutIdsCompletedToday(userId),
        loadWorkoutProgress(userId),
      ]);
      if (cancelled) return;
      setWorkouts(list);
      setCompletedTodayIds(completedIds);
      setLoadingWorkouts(false);

      if (!triedAutoSelectRef.current) {
        triedAutoSelectRef.current = true;
        const stillValid = !!saved
          && saved.dateStr === todayDateString()
          && list.some(w => w.id === saved.workoutId && w.active)
          && !completedIds.has(saved.workoutId);
        if (stillValid && saved) {
          pendingRestoreRef.current = saved;
          setSelectedWorkoutId(saved.workoutId);
        } else if (saved) {
          // Stale (different day, workout no longer active/already
          // completed) — never let it resurface later.
          clearWorkoutProgress(userId).catch(() => {});
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId]);

  // A coach assigning a new workout, or the daily completion lock clearing
  // at midnight, needs to show up without the trainee having to leave and
  // come back — periodic poll + immediate refresh on app foreground-resume
  // (RN fully suspends JS timers while backgrounded, so the poll alone would
  // otherwise wait up to the full interval after resuming).
  const reloadWorkoutsQuiet = useCallback(async () => {
    const profile = await getProfile(userId);
    if (!profile || profile.status === 'pending') return;
    const [list, completedIds] = await Promise.all([
      getWorkoutsForTrainee(userId),
      getWorkoutIdsCompletedToday(userId),
    ]);
    setWorkouts(list);
    setCompletedTodayIds(completedIds);
  }, [userId]);

  useEffect(() => {
    const interval = setInterval(reloadWorkoutsQuiet, 15000);
    return () => clearInterval(interval);
  }, [reloadWorkoutsQuiet]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') reloadWorkoutsQuiet();
    });
    return () => sub.remove();
  }, [reloadWorkoutsQuiet]);

  const toDoWorkouts = useMemo(
    () => workouts.filter(w => w.active && !completedTodayIds.has(w.id) && isScheduledForToday(w) && !isWorkoutDurationExpired(w)),
    [workouts, completedTodayIds]
  );
  const completedTodayWorkouts = useMemo(
    () => workouts.filter(w => w.active && completedTodayIds.has(w.id)),
    [workouts, completedTodayIds]
  );
  const notTodayWorkouts = useMemo(
    () => workouts.filter(w => w.active && !completedTodayIds.has(w.id) && !isScheduledForToday(w) && !isWorkoutDurationExpired(w)),
    [workouts, completedTodayIds]
  );
  const durationEndedWorkouts = useMemo(
    () => workouts.filter(w => w.active && !completedTodayIds.has(w.id) && isWorkoutDurationExpired(w)),
    [workouts, completedTodayIds]
  );
  const pastWorkouts = useMemo(() => workouts.filter(w => !w.active), [workouts]);
  const selectedWorkoutMeta = useMemo(
    () => workouts.find(w => w.id === selectedWorkoutId) ?? null,
    [workouts, selectedWorkoutId]
  );

  // ── Selected workout detail ──
  const [dbWorkout, setDbWorkout] = useState<Workout | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [exercises, setExercises] = useState<ExerciseLog[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [showMedal, setShowMedal] = useState(false);
  const [modalXp, setModalXp] = useState(0);
  const [modalIsComplete, setModalIsComplete] = useState(false);
  const [newlyEarnedMedalIds, setNewlyEarnedMedalIds] = useState<string[]>([]);

  // ── Rest timer (between sets) ──
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const tickPlayer = useAudioPlayer(require('../../assets/sounds/tick.wav'));
  const restNotificationId = useRef<string | null>(null);

  useEffect(() => {
    if (!restTimer) {
      setRestSecondsLeft(0);
      return;
    }
    scheduleRestEndNotification(restTimer.exerciseName, restTimer.totalSeconds).then(id => {
      restNotificationId.current = id;
    });
    const update = () => {
      const left = Math.max(0, Math.ceil((restTimer.endAt - Date.now()) / 1000));
      setRestSecondsLeft(left);
      if (left <= 0) {
        setRestTimer(null);
        return;
      }
      if (left <= 3 && left > 0) {
        Vibration.vibrate(200);
        if (AppState.currentState === 'active') {
          try {
            tickPlayer.seekTo(0);
            tickPlayer.play();
          } catch (e) {
            console.warn('Rest timer tick sound failed', e);
          }
        }
      }
    };
    update();
    const interval = setInterval(update, 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
      cancelRestEndNotification(restNotificationId.current);
      restNotificationId.current = null;
    };
  }, [restTimer?.endAt]);

  // Only clears the current period early — there is only ever one active
  // timer at a time, so this inherently can't affect any other rest period.
  const skipRestTimer = useCallback(() => {
    setRestTimer(null);
  }, []);

  useEffect(() => {
    if (!selectedWorkoutId) {
      setDbWorkout(null);
      setExercises([]);
      setSubmitted(false);
      setShowMedal(false);
      setNewlyEarnedMedalIds([]);
      return;
    }
    startWorkoutSession(selectedWorkoutId).catch(e => console.warn('startWorkoutSession error', e));
    let cancelled = false;
    setLoadingDetail(true);
    getWorkoutWithExercises(selectedWorkoutId).then((result) => {
      if (cancelled) return;
      if (result) {
        const w: Workout = {
          id: result.workout.id,
          name: result.workout.name,
          description: result.workout.description ?? '',
          duration: result.workout.duration ?? '60 min',
          difficulty: (result.workout.difficulty as any) ?? 'Intermediate',
          exercises: result.exercises.map((ex: any) => ({
            id: ex.id,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.weight ?? undefined,
            time: ex.time ?? undefined,
            restSeconds: ex.rest_seconds ?? undefined,
            completed: false,
            setDetails: ex.set_details ?? null,
            laterality: ex.laterality ?? null,
          })),
        };
        setDbWorkout(w);
        let initialExercises = buildInitialExercises(w);
        const restore = pendingRestoreRef.current;
        if (restore && restore.workoutId === selectedWorkoutId) {
          pendingRestoreRef.current = null;
          initialExercises = initialExercises.map(ex => {
            const savedSets = restore.setsByExerciseId[ex.id];
            return savedSets && savedSets.length === ex.sets.length ? { ...ex, sets: savedSets } : ex;
          });
          if (restore.restTimer && restore.restTimer.endAt > Date.now()) {
            setRestTimer(restore.restTimer);
          }
        }
        setExercises(initialExercises);
      } else {
        setDbWorkout(null);
      }
      setSubmitted(false);
      setLoadingDetail(false);
    });
    return () => { cancelled = true; };
  }, [selectedWorkoutId]);

  // Auto-tick an exercise's checkbox the moment every one of its sets has a
  // logged effort — the trainee no longer has to tap it manually to advance.
  useEffect(() => {
    setExercises(prev => {
      let changed = false;
      const next = prev.map(ex => {
        if (!ex.completed && ex.sets.length > 0 && ex.sets.every(s => s.effort !== null)) {
          changed = true;
          return { ...ex, completed: true };
        }
        return ex;
      });
      return changed ? next : prev;
    });
  }, [exercises]);

  const { completedCount, totalSets, loggedSets, progress, isFullyComplete } = useMemo(() => {
    const completed = exercises.filter(e => e.completed).length;
    const total = exercises.reduce((sum, e) => sum + e.sets.length, 0);
    const logged = exercises.reduce((sum, e) => sum + e.sets.filter(s => s.effort !== null).length, 0);
    return {
      completedCount: completed,
      totalSets: total,
      loggedSets: logged,
      progress: total > 0 ? logged / total : 0,
      isFullyComplete: completed === exercises.length && exercises.length > 0,
    };
  }, [exercises]);

  // Persists the in-progress session (including a running rest countdown)
  // to on-device storage on every change — the backstop for an actual app
  // kill (see workoutProgress.ts). Only while there's genuinely something to
  // lose (at least one logged set, not yet finished).
  useEffect(() => {
    if (!selectedWorkoutId || submitted || loggedSets === 0) return;
    saveWorkoutProgress(userId, {
      workoutId: selectedWorkoutId,
      dateStr: todayDateString(),
      setsByExerciseId: Object.fromEntries(exercises.map(ex => [ex.id, ex.sets])),
      restTimer: restTimer ? { exerciseId: restTimer.exerciseId, exerciseName: restTimer.exerciseName, setIndex: restTimer.setIndex, endAt: restTimer.endAt, totalSeconds: restTimer.totalSeconds } : null,
    });
  }, [exercises, selectedWorkoutId, submitted, loggedSets, userId, restTimer]);

  // Exercises must be done in order — only the first not-yet-completed exercise
  // is interactive; everything before it (already completed) and after it (not
  // reached yet) is locked. Equals exercises.length once every exercise is done.
  const activeExerciseIndex = useMemo(() => {
    const idx = exercises.findIndex(e => !e.completed);
    return idx === -1 ? exercises.length : idx;
  }, [exercises]);

  const sessionActive = loggedSets > 0 && !submitted;

  // Toggles a set's effort level and, unless this was the very last set of
  // the very last exercise, starts the rest timer — extracted out of
  // WorkoutScreen's JSX (where it used to be an inline onPress) since it's
  // now shared state owned here.
  const setEffort = useCallback((exerciseId: string, setIndex: number, level: number) => {
    setExercises(prev => {
      const exIndex = prev.findIndex(e => e.id === exerciseId);
      if (exIndex === -1) return prev;
      const exercise = prev[exIndex];
      const currentEffort = exercise.sets[setIndex]?.effort;
      const newValue = currentEffort === level ? null : level;
      const newSets = exercise.sets.map((s, i) => i === setIndex ? { ...s, effort: newValue } : s);
      const next = prev.map((e, i) => i === exIndex ? { ...e, sets: newSets } : e);

      const isVeryLastSet = exIndex === prev.length - 1 && setIndex === exercise.sets.length - 1;
      if (newValue !== null && !isVeryLastSet && exercise.restSeconds && exercise.restSeconds > 0) {
        setRestTimer({
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          setIndex,
          endAt: Date.now() + exercise.restSeconds * 1000,
          totalSeconds: exercise.restSeconds,
        });
      }
      return next;
    });
  }, []);

  // Lets a trainee reorder upcoming exercises (not yet-completed ones are
  // locked by the in-order rule above, and can't be reordered either).
  const reorderExercise = useCallback((exerciseId: string, direction: 'up' | 'down') => {
    setExercises(prev => {
      const idx = prev.findIndex(e => e.id === exerciseId);
      if (idx === -1) return prev;
      const activeIdx = (() => {
        const i = prev.findIndex(e => !e.completed);
        return i === -1 ? prev.length : i;
      })();
      if (idx < activeIdx) return prev; // can't reorder an already-completed exercise
      const target = idx + (direction === 'up' ? -1 : 1);
      if (target < activeIdx || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitted || loggedSets === 0 || !selectedWorkoutId) return;
    setModalIsComplete(isFullyComplete);
    setSubmitted(true);
    setShowMedal(true);

    let profile: Awaited<ReturnType<typeof getProfile>> = null;
    try {
      profile = await getProfile(userId);
    } catch (e) {
      console.warn('Workout completion: failed to load profile', e);
    }

    try {
      const details = exercises
        .filter(ex => ex.sets.some(s => s.effort !== null))
        .map(ex => ({
          name: ex.name,
          sets: ex.sets.map(s => ({ reps: s.reps, weight: s.weight, effort: s.effort })),
        }));
      const result = await completeWorkoutSession(
        selectedWorkoutId,
        details,
        Math.round(progress * 100),
        new Date().getHours(),
        todayDateString()
      );
      setCompletedTodayIds(prev => new Set(prev).add(selectedWorkoutId));
      clearWorkoutProgress(userId).catch(() => {});
      setModalXp(result.xpAwarded);
      setNewlyEarnedMedalIds(result.newlyEarnedMedalIds);
      if (result.newlyEarnedMedalIds.length > 0) {
        const names = result.newlyEarnedMedalIds.map(id => mockMedals.find(m => m.id === id)?.name).filter((n): n is string => !!n);
        notifyMedalsEarned(names).catch(() => {});
        if (profile?.coach_id && names.length > 0) {
          sendMessage(userId, profile.coach_id, `🏅 ${profile.name} earned: ${names.join(', ')}!`).catch(e =>
            console.warn('Workout completion: failed to notify coach of medal', e)
          );
        }
      }
    } catch (e) {
      console.warn('Workout completion: failed to save session', e);
    }

    try {
      const attempted = exercises.filter(ex => ex.sets.some(s => s.effort !== null));
      for (const ex of attempted) {
        await logExerciseWeight(userId, ex.name, ex.coachWeight ?? 'BW', ex.coachReps, ex.coachSets);
      }
    } catch (e) {
      console.warn('Workout completion: failed to write exercise log entries', e);
    }

    try {
      if (profile?.coach_id) {
        await sendMessage(
          userId,
          profile.coach_id,
          `🏋️ ${profile.name} completed "${dbWorkout?.name}" — ${Math.round(progress * 100)}% done`
        );
      }
    } catch (e) {
      console.warn('Workout completion: failed to notify coach', e);
    }
  }, [submitted, loggedSets, selectedWorkoutId, isFullyComplete, userId, exercises, progress, dbWorkout]);

  const value: ActiveWorkoutValue = {
    workouts, loadingWorkouts, isPending, completedTodayIds,
    toDoWorkouts, completedTodayWorkouts, notTodayWorkouts, durationEndedWorkouts, pastWorkouts, selectedWorkoutMeta,
    selectedWorkoutId, setSelectedWorkoutId, dbWorkout, loadingDetail, exercises, submitted,
    showMedal, setShowMedal, modalXp, modalIsComplete, newlyEarnedMedalIds,
    completedCount, totalSets, loggedSets, progress, isFullyComplete, activeExerciseIndex, sessionActive,
    restTimer, restSecondsLeft, skipRestTimer,
    setEffort, reorderExercise, handleSubmit,
  };

  return <ActiveWorkoutContext.Provider value={value}>{children}</ActiveWorkoutContext.Provider>;
}
