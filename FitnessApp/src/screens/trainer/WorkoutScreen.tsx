import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { Workout } from '../../data/mockData';
import { getWorkoutWithExercises, getProfile, saveWorkoutSession } from '../../lib/db';

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
    completed: false,
    sets: Array.from({ length: ex.sets }, () => ({
      reps: ex.reps,
      weight: ex.weight ?? '',
      effort: null,
    })),
  }));
}

export default function WorkoutScreen({ userId }: Props) {
  const [dbWorkout, setDbWorkout] = useState<Workout | null>(null);
  const [dbWorkoutId, setDbWorkoutId] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [loadingWorkout, setLoadingWorkout] = useState(true);

  const [exercises, setExercises] = useState<ExerciseLog[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [awardedXp, setAwardedXp] = useState(0);
  const [showMedal, setShowMedal] = useState(false);
  const [modalXp, setModalXp] = useState(0);
  const [modalIsComplete, setModalIsComplete] = useState(false);

  const toggleExercise = useCallback((id: string) => {
    setExercises(prev => prev.map(ex => ex.id === id ? { ...ex, completed: !ex.completed } : ex));
  }, []);

  const updateSet = useCallback((exId: string, setIndex: number, field: 'reps' | 'weight' | 'effort', value: string | number) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exId) return ex;
      const newSets = ex.sets.map((s, i) => i === setIndex ? { ...s, [field]: value } : s);
      return { ...ex, sets: newSets };
    }));
  }, []);

  useEffect(() => {
    async function loadWorkout() {
      const profile = await getProfile(userId);
      if (!profile) { setLoadingWorkout(false); return; }
      if (profile.status === 'pending') { setIsPending(true); setLoadingWorkout(false); return; }

      const result = await getWorkoutWithExercises(userId);
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
            completed: false,
          })),
        };
        setDbWorkout(w);
        setDbWorkoutId(result.workout.id);
        setExercises(buildInitialExercises(w));
      } else {
        setExercises([]);
      }
      setLoadingWorkout(false);
    }
    loadWorkout();
  }, [userId]);

  if (loadingWorkout) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pendingContainer}>
          <ActivityIndicator size="large" color={colors.xpBar} />
          <Text style={{ color: colors.textSecondary, marginTop: 16 }}>Loading workout...</Text>
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

  const activeWorkout = dbWorkout;

  const handleSubmit = async () => {
    const totalXp = isFullyComplete ? 250 : Math.round(250 * progress);
    const newXp = totalXp - awardedXp;
    setModalXp(newXp > 0 ? newXp : 0);
    setModalIsComplete(isFullyComplete);
    setAwardedXp(totalXp);
    setSubmitted(true);
    setShowMedal(true);
    if (dbWorkoutId) {
      try {
        await saveWorkoutSession({
          trainee_id: userId,
          workout_id: dbWorkoutId,
          completion_pct: Math.round(progress * 100),
          xp_awarded: totalXp,
        });
      } catch (e) {
        console.warn('Session save error', e);
      }
    }
  };

  const handleReset = () => {
    if (activeWorkout) setExercises(buildInitialExercises(activeWorkout));
    setSubmitted(false);
    setAwardedXp(0);
  };

  if (!activeWorkout) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pendingContainer}>
          <Ionicons name="barbell-outline" size={64} color={colors.textSecondary} />
          <Text style={styles.pendingTitle}>No Workout Assigned</Text>
          <Text style={styles.pendingSub}>Your coach hasn't assigned a workout yet.{'\n'}Check back soon!</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.programLabel}>TODAY'S SESSION</Text>
          <Text style={styles.workoutName}>{activeWorkout.name}</Text>
          <Text style={styles.workoutMeta}>
            {activeWorkout.exercises.length} exercises • {activeWorkout.duration} • {activeWorkout.difficulty}
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

                {/* Reps input */}
                <View style={styles.colReps}>
                  <TextInput
                    style={styles.setInput}
                    value={set.reps}
                    onChangeText={(v) => {
                      const digits = v.replace(/[^0-9]/g, '');
                      if (digits === '') { updateSet(exercise.id, setIndex, 'reps', ''); return; }
                      const num = parseInt(digits, 10);
                      const max = parseInt(exercise.coachReps, 10) + 8;
                      const clamped = Math.max(0, Math.min(num, max));
                      updateSet(exercise.id, setIndex, 'reps', String(clamped));
                    }}
                    keyboardType="number-pad"
                    placeholderTextColor={colors.textSecondary}
                    placeholder={exercise.coachReps}
                  />
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
                        onPress={() => updateSet(exercise.id, setIndex, 'effort', level)}
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

        {/* Status banner — shown after first submission */}
        {submitted && (
          <View style={[styles.completedBanner, isFullyComplete && styles.completedBannerFull]}>
            <Ionicons
              name={isFullyComplete ? 'checkmark-circle' : 'time'}
              size={32}
              color={isFullyComplete ? colors.success : colors.xpBar}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.completedTitle, !isFullyComplete && { color: colors.xpBar }]}>
                {isFullyComplete ? 'Workout Complete!' : 'Session Saved'}
              </Text>
              <Text style={styles.completedSub}>
                {isFullyComplete
                  ? `+${awardedXp} XP Earned`
                  : `${Math.round(progress * 100)}% logged — keep going!`}
              </Text>
            </View>
          </View>
        )}

        {/* Action button — show before submission (any state) or after submission only when fully complete */}
        {(!submitted || isFullyComplete) && (
          <TouchableOpacity
            style={[styles.completeButton, !isFullyComplete && styles.completeButtonPartial]}
            onPress={handleSubmit}
            activeOpacity={0.85}
          >
            <Ionicons name="trophy" size={22} color={colors.text} />
            <Text style={styles.completeButtonText}>
              {isFullyComplete ? 'Complete Workout!' : `Finish Early (${Math.round(progress * 100)}%)`}
            </Text>
          </TouchableOpacity>
        )}

        {submitted && (
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Ionicons name="refresh" size={18} color={colors.textSecondary} />
            <Text style={styles.resetText}>Reset Workout</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Medal Modal */}
      <Modal visible={showMedal} transparent animationType="fade">
        <View style={styles.medalOverlay}>
          <View style={styles.medalToast}>
            <View style={styles.medalIconWrapper}>
              <Ionicons name="trophy" size={56} color={colors.gold} />
            </View>
            <Text style={styles.medalTitle}>{modalIsComplete ? 'Workout Complete!' : 'Session Saved!'}</Text>
            <Text style={styles.medalSub}>{modalIsComplete ? 'You crushed it today!' : 'Keep going to earn the full reward'}</Text>
            <View style={styles.xpAward}>
              <Ionicons name="star" size={18} color={colors.xpBar} />
              <Text style={styles.xpAwardText}>+{modalXp} XP {modalIsComplete ? 'Awarded' : 'Earned so far'}</Text>
            </View>
            <View style={styles.medalUnlocked}>
              <View style={styles.medalUnlockedIcon}>
                <Ionicons name="fitness" size={24} color={colors.gold} />
              </View>
              <View>
                <Text style={styles.medalUnlockedLabel}>Medal Unlocked!</Text>
                <Text style={styles.medalUnlockedName}>First Workout</Text>
              </View>
            </View>
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

  header: { marginBottom: 24, marginTop: 8 },
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

  setInput: {
    backgroundColor: colors.secondary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
    width: '90%',
  },
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

  // Complete / reset
  completeButton: {
    backgroundColor: colors.primary,
    borderRadius: 16, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14,
  },
  completeButtonPartial: { backgroundColor: colors.accent, shadowColor: colors.accent },
  completeButtonText: { fontSize: 18, fontWeight: '700', color: colors.text },
  completedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.success + '22',
    borderRadius: 16, padding: 20, marginTop: 4,
    borderWidth: 1, borderColor: colors.success,
  },
  completedBannerFull: { borderColor: colors.success, backgroundColor: colors.success + '22' },
  completedTitle: { fontSize: 18, fontWeight: '800', color: colors.success },
  completedSub: { fontSize: 13, color: colors.xpBar, marginTop: 2, fontWeight: '600' },
  resetButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 14, paddingVertical: 12,
  },
  resetText: { fontSize: 14, color: colors.textSecondary },

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
