import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { Workout, mockMedals, computeLevelFromXp } from '../../data/mockData';
import {
  getWorkoutsForTrainee,
  getWorkoutWithExercises,
  getWorkoutIdsCompletedToday,
  getProfile,
  saveWorkoutSession,
  updateProfile,
  getTraineeHistory,
  evaluateAndAwardMedals,
  sendMessage,
  logExerciseWeight,
} from '../../lib/db';
import { DBWorkout } from '../../lib/supabase';

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isScheduledForToday(workout: DBWorkout): boolean {
  if (!workout.scheduled_days || workout.scheduled_days.length === 0) return true;
  return workout.scheduled_days.includes(new Date().getDay());
}

function scheduledDaysLabel(days: number[]): string {
  return [...days].sort((a, b) => a - b).map(d => DAY_ABBR[d]).join(', ');
}

function computeNewStreak(currentStreak: number, priorHistory: { completed_at: string }[]): number {
  if (priorHistory.length === 0) return 1;
  const toDayStr = (d: Date) => d.toISOString().split('T')[0];
  const sorted = [...priorHistory].sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
  const lastDayStr = toDayStr(new Date(sorted[0].completed_at));
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (lastDayStr === toDayStr(today)) return currentStreak || 1;
  if (lastDayStr === toDayStr(yesterday)) return (currentStreak || 0) + 1;
  return 1;
}

// Effort scale
const EFFORT_LABELS: Record<number, { short: string; desc: string; color: string }> = {
  0: { short: '0',  desc: '4+ reps in reserve',  color: '#4CAF50' },
  1: { short: '1',  desc: '2–3 reps in reserve', color: '#8BC34A' },
  2: { short: '2',  desc: '1–2 reps in reserve', color: '#FF9800' },
  3: { short: '3',  desc: '0–1 reps in reserve', color: '#FF5722' },
  4: { short: '4',  desc: "Couldn't finish",     color: '#E94560' },
};

interface SetLog {
  reps: string;
  weight: string;
  effort: number | null;
}

interface ExerciseLog {
  id: string;
  name: string;
  coachSets: number;
  coachReps: string;
  coachWeight?: string;
  coachTime?: string;
  completed: boolean;
  sets: SetLog[];
}

interface Props {
  userId: string;
}

function buildInitialExercises(workout: Workout): ExerciseLog[] {
  return workout.exercises.map((ex) => ({
    id: ex.id,
    name: ex.name,
    coachSets: ex.sets,
    coachReps: ex.reps,
    coachWeight: ex.weight,
    coachTime: ex.time,
    completed: false,
    sets: Array.from({ length: ex.sets }, () => ({
      reps: ex.reps,
      weight: ex.weight ?? '',
      effort: null,
    })),
  }));
}

export default function WorkoutScreen({ userId }: Props) {
  // ── Workout list (a trainee can have several workouts; only active ones can be done) ──
  const [workouts, setWorkouts] = useState<DBWorkout[]>([]);
  // A workout locks once completed, but only for the rest of today — it's
  // open again tomorrow. Scoped per calendar day, not permanent.
  const [completedTodayIds, setCompletedTodayIds] = useState<Set<string>>(new Set());
  const [loadingWorkouts, setLoadingWorkouts] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    async function load() {
      const profile = await getProfile(userId);
      if (cancelled) return;
      if (!profile) { setLoadingWorkouts(false); return; }
      if (profile.status === 'pending') { setIsPending(true); setLoadingWorkouts(false); return; }
      setIsPending(false);
      const [list, completedIds] = await Promise.all([
        getWorkoutsForTrainee(userId),
        getWorkoutIdsCompletedToday(userId),
      ]);
      if (!cancelled) {
        setWorkouts(list);
        setCompletedTodayIds(completedIds);
        setLoadingWorkouts(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId]));

  const toDoWorkouts = useMemo(
    () => workouts.filter(w => w.active && !completedTodayIds.has(w.id) && isScheduledForToday(w)),
    [workouts, completedTodayIds]
  );
  const completedTodayWorkouts = useMemo(
    () => workouts.filter(w => w.active && completedTodayIds.has(w.id)),
    [workouts, completedTodayIds]
  );
  const notTodayWorkouts = useMemo(
    () => workouts.filter(w => w.active && !completedTodayIds.has(w.id) && !isScheduledForToday(w)),
    [workouts, completedTodayIds]
  );
  const pastWorkouts = useMemo(() => workouts.filter(w => !w.active), [workouts]);
  const selectedWorkoutMeta = useMemo(
    () => workouts.find(w => w.id === selectedWorkoutId) ?? null,
    [workouts, selectedWorkoutId]
  );

  // ── Selected workout detail (exercise log / read-only view) ──
  const [dbWorkout, setDbWorkout] = useState<Workout | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [exercises, setExercises] = useState<ExerciseLog[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [showMedal, setShowMedal] = useState(false);
  const [modalXp, setModalXp] = useState(0);
  const [modalIsComplete, setModalIsComplete] = useState(false);
  const [newlyEarnedMedalIds, setNewlyEarnedMedalIds] = useState<string[]>([]);

  useEffect(() => {
    if (!selectedWorkoutId) {
      setDbWorkout(null);
      setExercises([]);
      setSubmitted(false);
      setShowMedal(false);
      setNewlyEarnedMedalIds([]);
      return;
    }
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
            completed: false,
          })),
        };
        setDbWorkout(w);
        setExercises(buildInitialExercises(w));
      } else {
        setDbWorkout(null);
      }
      setSubmitted(false);
      setLoadingDetail(false);
    });
    return () => { cancelled = true; };
  }, [selectedWorkoutId]);

  const toggleExercise = useCallback((id: string) => {
    setExercises(prev => prev.map(ex => ex.id === id ? { ...ex, completed: !ex.completed } : ex));
  }, []);

  const updateSet = useCallback((exId: string, setIndex: number, field: 'reps' | 'weight' | 'effort', value: string | number | null) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exId) return ex;
      const newSets = ex.sets.map((s, i) => i === setIndex ? { ...s, [field]: value } : s);
      return { ...ex, sets: newSets };
    }));
  }, []);

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

  const handleSubmit = async () => {
    if (submitted || loggedSets === 0 || !selectedWorkoutId) return;
    const workoutXp = Math.round(250 * progress);
    setModalIsComplete(isFullyComplete);
    setSubmitted(true);
    setShowMedal(true);

    // Each step is isolated so a failure in one (e.g. the coach notification)
    // can never silently block the ones after it — most importantly xp/streak.
    let priorHistory: Awaited<ReturnType<typeof getTraineeHistory>> = [];
    let profile: Awaited<ReturnType<typeof getProfile>> = null;
    try {
      [priorHistory, profile] = await Promise.all([getTraineeHistory(userId), getProfile(userId)]);
    } catch (e) {
      console.warn('Workout completion: failed to load prior history/profile', e);
    }

    try {
      const details = exercises
        .filter(ex => ex.sets.some(s => s.effort !== null))
        .map(ex => ({
          name: ex.name,
          sets: ex.sets.map(s => ({ reps: s.reps, weight: s.weight, effort: s.effort })),
        }));
      await saveWorkoutSession({
        trainee_id: userId,
        workout_id: selectedWorkoutId,
        completion_pct: Math.round(progress * 100),
        xp_awarded: workoutXp,
        details,
      });
      // Locks this workout for the rest of today — it reopens tomorrow.
      setCompletedTodayIds(prev => new Set(prev).add(selectedWorkoutId));
    } catch (e) {
      console.warn('Workout completion: failed to save session', e);
    }

    // Record what was actually done today against each attempted exercise, so
    // the Log tab reflects real completed workouts instead of staying empty.
    try {
      const attempted = exercises.filter(ex => ex.sets.some(s => s.effort !== null));
      for (const ex of attempted) {
        await logExerciseWeight(userId, ex.name, ex.coachWeight ?? 'BW', ex.coachReps, ex.coachSets);
      }
    } catch (e) {
      console.warn('Workout completion: failed to write exercise log entries', e);
    }

    // Evaluate medals before the XP write so a newly-earned medal's reward
    // can be folded into the same update as the workout XP — medal cards
    // advertise "+N XP", so earning one should actually grant that XP.
    let newStreak = profile?.streak ?? 0;
    let newlyEarned: string[] = [];
    try {
      newStreak = computeNewStreak(profile?.streak ?? 0, priorHistory);
      newlyEarned = await evaluateAndAwardMedals(userId, priorHistory.length + 1, newStreak);
      setNewlyEarnedMedalIds(newlyEarned);
    } catch (e) {
      console.warn('Workout completion: failed to evaluate medals', e);
    }

    const medalBonusXp = newlyEarned.reduce((sum, id) => sum + (mockMedals.find(m => m.id === id)?.xpReward ?? 0), 0);
    const totalXp = workoutXp + medalBonusXp;
    setModalXp(totalXp);

    try {
      const newXp = (profile?.xp ?? 0) + totalXp;
      const newLevel = computeLevelFromXp(newXp);
      await updateProfile(userId, { xp: newXp, level: newLevel, streak: newStreak });
    } catch (e) {
      console.warn('Workout completion: failed to update xp/level/streak', e);
    }

    try {
      if (profile?.coach_id) {
        await sendMessage(
          userId,
          profile.coach_id,
          `🏋️ ${profile.name} completed "${dbWorkout?.name}" — ${Math.round(progress * 100)}% done, +${totalXp} XP`
        );
      }
    } catch (e) {
      console.warn('Workout completion: failed to notify coach', e);
    }
  };

  if (loadingWorkouts) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pendingContainer}>
          <ActivityIndicator size="large" color={colors.xpBar} />
          <Text style={{ color: colors.textSecondary, marginTop: 16 }}>Loading workouts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isPending) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pendingContainer}>
          <Ionicons name="time-outline" size={64} color={colors.xpBar} />
          <Text style={styles.pendingTitle}>Waiting for Coach</Text>
          <Text style={styles.pendingSub}>Your account is set up.{'\n'}Your coach will assign your program soon.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Workout picker (landing view) ──
  if (!selectedWorkoutId) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.programLabel}>YOUR WORKOUTS</Text>
            <Text style={styles.workoutName}>Choose a Workout</Text>
          </View>

          {workouts.length === 0 ? (
            <View style={styles.pendingContainer}>
              <Ionicons name="barbell-outline" size={64} color={colors.textSecondary} />
              <Text style={styles.pendingTitle}>No Workout Assigned</Text>
              <Text style={styles.pendingSub}>Your coach hasn't assigned a workout yet.{'\n'}Check back soon!</Text>
            </View>
          ) : (
            <>
              {toDoWorkouts.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>TO DO — TAP TO START</Text>
                  {toDoWorkouts.map(w => (
                    <TouchableOpacity
                      key={w.id}
                      style={styles.workoutPickCard}
                      onPress={() => setSelectedWorkoutId(w.id)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.workoutPickIcon}>
                        <Ionicons name="barbell" size={20} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.workoutPickName}>{w.name}</Text>
                        <Text style={styles.workoutPickMeta}>
                          {w.duration} • {w.difficulty}
                          {w.scheduled_days && w.scheduled_days.length > 0 ? ` • ${scheduledDaysLabel(w.scheduled_days)}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {completedTodayWorkouts.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: toDoWorkouts.length > 0 ? 20 : 0 }]}>
                    COMPLETED TODAY — BACK TOMORROW
                  </Text>
                  {completedTodayWorkouts.map(w => (
                    <TouchableOpacity
                      key={w.id}
                      style={[styles.workoutPickCard, styles.workoutPickCardInactive]}
                      onPress={() => setSelectedWorkoutId(w.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.workoutPickIcon, styles.workoutPickIconDone]}>
                        <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.workoutPickName}>{w.name}</Text>
                        <Text style={styles.workoutPickMeta}>{w.duration} • {w.difficulty}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {notTodayWorkouts.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: (toDoWorkouts.length > 0 || completedTodayWorkouts.length > 0) ? 20 : 0 }]}>
                    NOT TODAY
                  </Text>
                  {notTodayWorkouts.map(w => (
                    <TouchableOpacity
                      key={w.id}
                      style={[styles.workoutPickCard, styles.workoutPickCardInactive]}
                      onPress={() => setSelectedWorkoutId(w.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.workoutPickIcon, styles.workoutPickIconInactive]}>
                        <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.workoutPickName}>{w.name}</Text>
                        <Text style={styles.workoutPickMeta}>
                          {w.duration} • {w.difficulty} • {scheduledDaysLabel(w.scheduled_days ?? [])}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {pastWorkouts.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: (toDoWorkouts.length > 0 || completedTodayWorkouts.length > 0 || notTodayWorkouts.length > 0) ? 20 : 0 }]}>
                    PAST — VIEW ONLY
                  </Text>
                  {pastWorkouts.map(w => (
                    <TouchableOpacity
                      key={w.id}
                      style={[styles.workoutPickCard, styles.workoutPickCardInactive]}
                      onPress={() => setSelectedWorkoutId(w.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.workoutPickIcon, styles.workoutPickIconInactive]}>
                        <Ionicons name="archive-outline" size={20} color={colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.workoutPickName}>{w.name}</Text>
                        <Text style={styles.workoutPickMeta}>{w.duration} • {w.difficulty}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Selected workout: loading its exercises ──
  if (loadingDetail || !dbWorkout) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={styles.backRow} onPress={() => setSelectedWorkoutId(null)}>
          <Ionicons name="chevron-back" size={20} color={colors.xpBar} />
          <Text style={styles.backRowText}>All Workouts</Text>
        </TouchableOpacity>
        <View style={styles.pendingContainer}>
          <ActivityIndicator size="large" color={colors.xpBar} />
        </View>
      </SafeAreaView>
    );
  }

  const isCompletedToday = selectedWorkoutId ? completedTodayIds.has(selectedWorkoutId) : false;
  const isNotToday = selectedWorkoutMeta ? (selectedWorkoutMeta.active && !isCompletedToday && !isScheduledForToday(selectedWorkoutMeta)) : false;
  const readOnlyReason: 'inactive' | 'completed' | 'notToday' | null = !selectedWorkoutMeta
    ? null
    : !selectedWorkoutMeta.active ? 'inactive'
    : isCompletedToday ? 'completed'
    : isNotToday ? 'notToday'
    : null;

  // ── Read-only view: inactive, already completed today, or not scheduled
  // for today — either way, no logging/finish. ──
  if (readOnlyReason) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity style={styles.backRow} onPress={() => setSelectedWorkoutId(null)}>
            <Ionicons name="chevron-back" size={20} color={colors.xpBar} />
            <Text style={styles.backRowText}>All Workouts</Text>
          </TouchableOpacity>

          <View style={styles.readOnlyBanner}>
            <Ionicons
              name={readOnlyReason === 'completed' ? 'checkmark-circle' : readOnlyReason === 'notToday' ? 'calendar-outline' : 'archive-outline'}
              size={16}
              color={readOnlyReason === 'completed' ? colors.success : colors.textSecondary}
            />
            <Text style={styles.readOnlyBannerText}>
              {readOnlyReason === 'completed'
                ? "You've already completed this workout today — it reopens tomorrow."
                : readOnlyReason === 'notToday'
                ? `Not scheduled for today — comes back on ${scheduledDaysLabel(selectedWorkoutMeta?.scheduled_days ?? [])}.`
                : 'This workout is no longer active — view only.'}
            </Text>
          </View>

          <View style={styles.header}>
            <Text style={styles.programLabel}>
              {readOnlyReason === 'completed' ? 'COMPLETED TODAY' : readOnlyReason === 'notToday' ? 'NOT SCHEDULED TODAY' : 'PAST WORKOUT'}
            </Text>
            <Text style={styles.workoutName}>{dbWorkout.name}</Text>
            <Text style={styles.workoutMeta}>
              {dbWorkout.exercises.length} exercises • {dbWorkout.duration} • {dbWorkout.difficulty}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>EXERCISES</Text>
          {dbWorkout.exercises.map((ex, i) => (
            <View key={ex.id} style={styles.readOnlyExerciseRow}>
              <View style={styles.exerciseNumber}>
                <Text style={styles.exerciseNumberText}>{i + 1}</Text>
              </View>
              <Text style={styles.readOnlyExerciseName}>{ex.name}</Text>
              <Text style={styles.readOnlyExerciseMeta}>{ex.sets}×{ex.reps}</Text>
              {ex.weight ? <Text style={styles.readOnlyExerciseWeight}>{ex.weight}</Text> : null}
              {ex.time && ex.time !== '0' ? <Text style={styles.readOnlyExerciseWeight}>{ex.time}</Text> : null}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.backRow} onPress={() => setSelectedWorkoutId(null)}>
          <Ionicons name="chevron-back" size={20} color={colors.xpBar} />
          <Text style={styles.backRowText}>All Workouts</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.programLabel}>TODAY'S SESSION</Text>
          <Text style={styles.workoutName}>{dbWorkout.name}</Text>
          <Text style={styles.workoutMeta}>
            {dbWorkout.exercises.length} exercises • {dbWorkout.duration} • {dbWorkout.difficulty}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.progressLabel}>{completedCount}/{exercises.length} Completed</Text>
            <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
          </View>
        </View>

        {/* Exercise cards */}
        <Text style={styles.sectionTitle}>EXERCISES</Text>
        {exercises.map((exercise, exIndex) => (
          <View
            key={exercise.id}
            style={[styles.exerciseCard, exercise.completed && styles.exerciseCardDone]}
          >
            {/* Exercise header row */}
            <View style={styles.exerciseHeaderRow}>
              <View style={styles.exerciseNumber}>
                <Text style={styles.exerciseNumberText}>{exIndex + 1}</Text>
              </View>
              <Text style={[styles.exerciseName, exercise.completed && styles.exerciseNameDone]}>
                {exercise.name}
              </Text>
              {exercise.coachTime && exercise.coachTime !== '0' && (
                <View style={styles.exerciseTimeBadge}>
                  <Ionicons name="time-outline" size={12} color={colors.xpBar} />
                  <Text style={styles.exerciseTimeBadgeText}>{exercise.coachTime}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.checkbox, exercise.completed && styles.checkboxDone]}
                onPress={() => toggleExercise(exercise.id)}
              >
                {exercise.completed && <Ionicons name="checkmark" size={18} color={colors.text} />}
              </TouchableOpacity>
            </View>

            {/* Set table header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.colHeader, styles.colSet]}>SET</Text>
              <Text style={[styles.colHeader, styles.colReps]}>REPS</Text>
              <Text style={[styles.colHeader, styles.colWeight]}>WEIGHT</Text>
              <Text style={[styles.colHeader, styles.colEffort]}>EFFORT</Text>
            </View>

            {/* Set rows */}
            {exercise.sets.map((set, setIndex) => (
              <View key={setIndex} style={styles.setRow}>
                {/* Set number */}
                <View style={styles.colSet}>
                  <View style={styles.setBadge}>
                    <Text style={styles.setBadgeText}>{setIndex + 1}</Text>
                  </View>
                </View>

                {/* Reps display (read-only) — trainees follow the coach-assigned reps, they don't set them */}
                <View style={styles.colReps}>
                  <View style={styles.setInputDisplay}>
                    <Text style={styles.setInputDisplayText}>{set.reps}</Text>
                  </View>
                </View>

                {/* Weight display (read-only) */}
                <View style={styles.colWeight}>
                  <View style={styles.setInputDisplay}>
                    <Text style={styles.setInputDisplayText}>{set.weight || 'BW'}</Text>
                  </View>
                </View>

                {/* Effort buttons */}
                <View style={[styles.colEffort, styles.effortButtons]}>
                  {[0, 1, 2, 3, 4].map((level) => {
                    const selected = set.effort === level;
                    const cfg = EFFORT_LABELS[level];
                    return (
                      <TouchableOpacity
                        key={level}
                        style={[
                          styles.effortBtn,
                          { borderColor: cfg.color },
                          selected && { backgroundColor: cfg.color },
                        ]}
                        onPress={() => updateSet(exercise.id, setIndex, 'effort', selected ? null : level)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.effortBtnText, selected && styles.effortBtnTextSelected]}>
                          {cfg.short}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}

            {/* Effort legend — shows under a set when effort is selected */}
            {exercise.sets.some((s) => s.effort !== null) && (
              <View style={styles.effortLegendRow}>
                {exercise.sets.map((set, i) =>
                  set.effort !== null ? (
                    <View key={i} style={styles.effortLegendItem}>
                      <View style={[styles.effortDot, { backgroundColor: EFFORT_LABELS[set.effort].color }]} />
                      <Text style={styles.effortLegendText}>
                        Set {i + 1}: {EFFORT_LABELS[set.effort].desc}
                      </Text>
                    </View>
                  ) : null
                )}
              </View>
            )}
          </View>
        ))}

        {/* Effort scale key */}
        <View style={styles.effortKey}>
          <Text style={styles.effortKeyTitle}>EFFORT SCALE</Text>
          {Object.entries(EFFORT_LABELS).map(([k, v]) => (
            <View key={k} style={styles.effortKeyRow}>
              <View style={[styles.effortKeyDot, { backgroundColor: v.color }]}>
                <Text style={styles.effortKeyNum}>{k}</Text>
              </View>
              <Text style={styles.effortKeyDesc}>{v.desc}</Text>
            </View>
          ))}
        </View>

        {/* Status banner — shown once finished */}
        {submitted && (
          <View style={[styles.completedBanner, isFullyComplete && styles.completedBannerFull]}>
            <Ionicons
              name={isFullyComplete ? 'checkmark-circle' : 'time'}
              size={32}
              color={isFullyComplete ? colors.success : colors.xpBar}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.completedTitle, !isFullyComplete && { color: colors.xpBar }]}>
                {isFullyComplete ? 'Workout Complete!' : 'Workout Finished'}
              </Text>
              <Text style={styles.completedSub}>
                +{modalXp} XP Earned ({Math.round(progress * 100)}% logged)
              </Text>
            </View>
          </View>
        )}

        {/* Action button — hidden once finished; each session gets logged once */}
        {!submitted && (
          <>
            <TouchableOpacity
              style={[styles.completeButton, loggedSets === 0 && styles.completeButtonDisabled]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={loggedSets === 0}
            >
              <Ionicons name="trophy" size={22} color={colors.text} />
              <Text style={styles.completeButtonText}>Finish</Text>
            </TouchableOpacity>
            {loggedSets === 0 && (
              <Text style={styles.completeHint}>Log at least one set's effort before finishing</Text>
            )}
          </>
        )}
      </ScrollView>

      {/* Medal Modal */}
      <Modal visible={showMedal} transparent animationType="fade" onRequestClose={() => setShowMedal(false)}>
        <View style={styles.medalOverlay}>
          <View style={styles.medalToast}>
            <View style={styles.medalIconWrapper}>
              <Ionicons name="trophy" size={56} color={colors.gold} />
            </View>
            <Text style={styles.medalTitle}>{modalIsComplete ? 'Workout Complete!' : 'Workout Finished!'}</Text>
            <Text style={styles.medalSub}>{modalIsComplete ? 'You crushed it today!' : 'Nice work — see you next time'}</Text>
            <View style={styles.xpAward}>
              <Ionicons name="star" size={18} color={colors.xpBar} />
              <Text style={styles.xpAwardText}>+{modalXp} XP Awarded</Text>
            </View>
            {newlyEarnedMedalIds.length > 0 && (() => {
              const medal = mockMedals.find(m => m.id === newlyEarnedMedalIds[0]);
              if (!medal) return null;
              return (
                <View style={styles.medalUnlocked}>
                  <View style={styles.medalUnlockedIcon}>
                    <Ionicons name={medal.icon as any} size={24} color={colors.gold} />
                  </View>
                  <View>
                    <Text style={styles.medalUnlockedLabel}>Medal Unlocked!</Text>
                    <Text style={styles.medalUnlockedName}>{medal.name}</Text>
                  </View>
                </View>
              );
            })()}
            <TouchableOpacity style={styles.medalButton} onPress={() => setShowMedal(false)}>
              <Text style={styles.medalButtonText}>Awesome!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, paddingBottom: 48 },

  // Pending state
  pendingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  pendingTitle: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 20, marginBottom: 10 },
  pendingSub: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  pendingCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  pendingCardText: { fontSize: 14, color: colors.textSecondary },

  // Back row (returns to workout picker)
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 12, marginTop: 4, alignSelf: 'flex-start' },
  backRowText: { fontSize: 14, fontWeight: '600', color: colors.xpBar },

  // Workout picker cards
  workoutPickCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: colors.border,
  },
  workoutPickCardInactive: { opacity: 0.7 },
  workoutPickIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center',
  },
  workoutPickIconInactive: { backgroundColor: colors.secondary },
  workoutPickIconDone: { backgroundColor: colors.success + '22' },
  workoutPickName: { fontSize: 16, fontWeight: '700', color: colors.text },
  workoutPickMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Read-only (past workout) view
  readOnlyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.secondary, borderRadius: 10, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  readOnlyBannerText: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  readOnlyExerciseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  readOnlyExerciseName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  readOnlyExerciseMeta: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  readOnlyExerciseWeight: { fontSize: 12, color: colors.xpBar, fontWeight: '600', marginLeft: 8 },

  header: { marginBottom: 24, marginTop: 4 },
  programLabel: { fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 2, marginBottom: 6 },
  workoutName: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 6 },
  workoutMeta: { fontSize: 13, color: colors.textSecondary },

  progressSection: { marginBottom: 28 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  progressPercent: { fontSize: 14, color: colors.text, fontWeight: '700' },
  progressBg: { height: 10, backgroundColor: colors.secondary, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.xpBar, borderRadius: 5 },

  sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1.5, marginBottom: 12 },

  // Exercise card
  exerciseCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseCardDone: { borderColor: colors.xpBar + '66', backgroundColor: '#0a1f1d' },

  exerciseHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  exerciseTimeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.xpBar + '22', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  exerciseTimeBadgeText: { fontSize: 12, fontWeight: '700', color: colors.xpBar },
  exerciseNumber: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  exerciseNumberText: { fontSize: 14, fontWeight: '700', color: colors.xpBar },
  exerciseName: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  exerciseNameDone: { color: colors.textSecondary, textDecorationLine: 'line-through' },

  checkbox: {
    width: 36, height: 36, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: colors.xpBar, borderColor: colors.xpBar },

  // Set table
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  colHeader: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1 },
  colSet: { width: 36, alignItems: 'center' },
  colReps: { flex: 1, alignItems: 'center' },
  colWeight: { flex: 1, alignItems: 'center' },
  colEffort: { width: 130, alignItems: 'center' },

  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  setBadge: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: colors.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  setBadgeText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },

  setInputDisplay: {
    backgroundColor: colors.secondary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
    width: '90%',
    alignItems: 'center',
  },
  setInputDisplayText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },

  effortButtons: { flexDirection: 'row', gap: 4 },
  effortBtn: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  effortBtnText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  effortBtnTextSelected: { color: '#fff' },

  // Effort legend under sets
  effortLegendRow: { marginTop: 10, gap: 4 },
  effortLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  effortDot: { width: 8, height: 8, borderRadius: 4 },
  effortLegendText: { fontSize: 12, color: colors.textSecondary },

  // Effort key card
  effortKey: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  effortKeyTitle: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1.5, marginBottom: 12 },
  effortKeyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  effortKeyDot: {
    width: 26, height: 26, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  effortKeyNum: { fontSize: 13, fontWeight: '800', color: '#fff' },
  effortKeyDesc: { fontSize: 13, color: colors.text, fontWeight: '500' },

  // Complete
  completeButton: {
    backgroundColor: colors.primary,
    borderRadius: 16, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14,
  },
  completeButtonText: { fontSize: 18, fontWeight: '700', color: colors.text },
  completeButtonDisabled: { opacity: 0.4, shadowOpacity: 0 },
  completeHint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 10 },
  completedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.success + '22',
    borderRadius: 16, padding: 20, marginTop: 4,
    borderWidth: 1, borderColor: colors.success,
  },
  completedBannerFull: { borderColor: colors.success, backgroundColor: colors.success + '22' },
  completedTitle: { fontSize: 18, fontWeight: '800', color: colors.success },
  completedSub: { fontSize: 13, color: colors.xpBar, marginTop: 2, fontWeight: '600' },

  // Medal modal
  medalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  medalToast: {
    backgroundColor: colors.card, borderRadius: 28, padding: 32,
    alignItems: 'center', width: '100%', maxWidth: 360,
    borderWidth: 1, borderColor: colors.gold + '44',
  },
  medalIconWrapper: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.gold + '22',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, borderWidth: 2, borderColor: colors.gold,
  },
  medalTitle: { fontSize: 26, fontWeight: '900', color: colors.text, marginBottom: 4 },
  medalSub: { fontSize: 16, color: colors.textSecondary, marginBottom: 20 },
  xpAward: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.xpBar + '22',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginBottom: 20,
  },
  xpAwardText: { fontSize: 16, fontWeight: '700', color: colors.xpBar },
  medalUnlocked: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.gold + '11',
    borderWidth: 1, borderColor: colors.gold + '44',
    borderRadius: 14, padding: 16, width: '100%', marginBottom: 24,
  },
  medalUnlockedIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: colors.gold + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  medalUnlockedLabel: { fontSize: 11, color: colors.gold, fontWeight: '700', letterSpacing: 1 },
  medalUnlockedName: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 2 },
  medalButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48 },
  medalButtonText: { fontSize: 17, fontWeight: '700', color: colors.text },
});
