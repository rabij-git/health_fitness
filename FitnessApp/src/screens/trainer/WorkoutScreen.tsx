import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Text } from '../../components/AppText';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { mockMedals } from '../../data/mockData';
import { isWorkoutDurationExpired, formatWorkoutEndDate, getProgramWeekProgress } from '../../lib/workoutDuration';
import { useActiveWorkout } from '../../contexts/ActiveWorkoutContext';

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isScheduledForToday(workout: { scheduled_days?: number[] | null }): boolean {
  if (!workout.scheduled_days || workout.scheduled_days.length === 0) return true;
  return workout.scheduled_days.includes(new Date().getDay());
}

function scheduledDaysLabel(days: number[]): string {
  return [...days].sort((a, b) => a - b).map(d => DAY_ABBR[d]).join(', ');
}

function durationWeeksLabel(weeks: number | null | undefined): string {
  return weeks != null ? `${weeks} wk${weeks === 1 ? '' : 's'} program` : '';
}

// XP earning rates — see the "Gamification & Leveling System" spec in
// CLAUDE.md. Running/distance-based rewards (per-km, speed records,
// marathon) are deliberately out of scope — the app has no GPS/distance
// tracking at all yet. The actual rates/formulas now live server-side (see
// scripts/secure_gamification.sql) — completeWorkoutSession is the only
// thing that computes and writes XP/level/streak/medals, so there are no
// client-side constants for them here anymore.

// Effort scale
const EFFORT_LABELS: Record<number, { short: string; desc: string; color: string }> = {
  0: { short: '0',  desc: '4+ reps in reserve',  color: '#4CAF50' },
  1: { short: '1',  desc: '2–3 reps in reserve', color: '#8BC34A' },
  2: { short: '2',  desc: '1–2 reps in reserve', color: '#FF9800' },
  3: { short: '3',  desc: '0–1 reps in reserve', color: '#FF5722' },
  4: { short: '4',  desc: "Couldn't finish",     color: '#E94560' },
};

interface Props {
  userId: string;
}

export default function WorkoutScreen({ userId }: Props) {
  const aw = useActiveWorkout();
  const {
    workouts, loadingWorkouts, isPending, completedTodayIds,
    toDoWorkouts, completedTodayWorkouts, notTodayWorkouts, durationEndedWorkouts, pastWorkouts, selectedWorkoutMeta,
    selectedWorkoutId, setSelectedWorkoutId, dbWorkout, loadingDetail, exercises, submitted,
    showMedal, setShowMedal, modalXp, modalIsComplete, newlyEarnedMedalIds,
    completedCount, loggedSets, progress, isFullyComplete, activeExerciseIndex, sessionActive,
    restTimer, setEffort, reorderExercise, handleSubmit,
  } = aw;

  // Deep-link from the Home screen's "Workout Today" list — same
  // openXId route-param pattern CoachDashboard uses to jump into a specific
  // trainee on CoachTrainees.
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  useEffect(() => {
    const openId = route.params?.openWorkoutId;
    if (!openId) return;
    if (selectedWorkoutId && selectedWorkoutId !== openId && sessionActive) {
      // Blocked — a different workout is already in progress. Just clear the
      // param so it doesn't keep re-firing; stay on the active session.
      navigation.setParams({ openWorkoutId: undefined });
      return;
    }
    setSelectedWorkoutId(openId);
    navigation.setParams({ openWorkoutId: undefined });
  }, [route.params?.openWorkoutId, navigation, selectedWorkoutId, sessionActive, setSelectedWorkoutId]);

  if (loadingWorkouts) {
    return (
      <View style={styles.container}>
        <View style={styles.pendingContainer}>
          <ActivityIndicator size="large" color={colors.xpBar} />
          <Text style={{ color: colors.textSecondary, marginTop: 16 }}>Loading workouts...</Text>
        </View>
      </View>
    );
  }

  if (isPending) {
    return (
      <View style={styles.container}>
        <View style={styles.pendingContainer}>
          <Ionicons name="time-outline" size={64} color={colors.xpBar} />
          <Text style={styles.pendingTitle}>Waiting for Coach</Text>
          <Text style={styles.pendingSub}>Your account is set up.{'\n'}Your coach will assign your program soon.</Text>
        </View>
      </View>
    );
  }

  // ── Workout picker (landing view) ──
  if (!selectedWorkoutId) {
    return (
      <View style={styles.container}>
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
                          {w.duration_weeks != null ? ` • ${durationWeeksLabel(w.duration_weeks)}` : ''}
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
                        <Text style={styles.workoutPickMeta}>
                          {w.duration} • {w.difficulty}
                          {w.duration_weeks != null ? ` • ${durationWeeksLabel(w.duration_weeks)}` : ''}
                        </Text>
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
                          {w.duration_weeks != null ? ` • ${durationWeeksLabel(w.duration_weeks)}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {durationEndedWorkouts.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: (toDoWorkouts.length > 0 || completedTodayWorkouts.length > 0 || notTodayWorkouts.length > 0) ? 20 : 0 }]}>
                    PROGRAM ENDED
                  </Text>
                  {durationEndedWorkouts.map(w => (
                    <TouchableOpacity
                      key={w.id}
                      style={[styles.workoutPickCard, styles.workoutPickCardInactive]}
                      onPress={() => setSelectedWorkoutId(w.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.workoutPickIcon, styles.workoutPickIconInactive]}>
                        <Ionicons name="flag-outline" size={20} color={colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.workoutPickName}>{w.name}</Text>
                        <Text style={styles.workoutPickMeta}>
                          {w.duration} • {w.difficulty} • Ended {formatWorkoutEndDate(w)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {pastWorkouts.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: (toDoWorkouts.length > 0 || completedTodayWorkouts.length > 0 || notTodayWorkouts.length > 0 || durationEndedWorkouts.length > 0) ? 20 : 0 }]}>
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
                        <Text style={styles.workoutPickMeta}>
                          {w.duration} • {w.difficulty}
                          {w.duration_weeks != null ? ` • ${durationWeeksLabel(w.duration_weeks)}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Selected workout: loading its exercises ──
  if (loadingDetail || !dbWorkout) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backRow} onPress={() => setSelectedWorkoutId(null)}>
          <Ionicons name="chevron-back" size={20} color={colors.xpBar} />
          <Text style={styles.backRowText}>All Workouts</Text>
        </TouchableOpacity>
        <View style={styles.pendingContainer}>
          <ActivityIndicator size="large" color={colors.xpBar} />
        </View>
      </View>
    );
  }

  const isCompletedToday = selectedWorkoutId ? completedTodayIds.has(selectedWorkoutId) : false;
  const isExpiredByDuration = selectedWorkoutMeta ? isWorkoutDurationExpired(selectedWorkoutMeta) : false;
  const weekProgress = selectedWorkoutMeta ? getProgramWeekProgress(selectedWorkoutMeta) : null;
  const isNotToday = selectedWorkoutMeta ? (selectedWorkoutMeta.active && !isCompletedToday && !isExpiredByDuration && !isScheduledForToday(selectedWorkoutMeta)) : false;
  const readOnlyReason: 'inactive' | 'expired' | 'completed' | 'notToday' | null = !selectedWorkoutMeta
    ? null
    : !selectedWorkoutMeta.active ? 'inactive'
    : isExpiredByDuration ? 'expired'
    : isCompletedToday ? 'completed'
    : isNotToday ? 'notToday'
    : null;

  // ── Read-only view: inactive, already completed today, or not scheduled
  // for today — either way, no logging/finish. ──
  if (readOnlyReason) {
    return (
      <View style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity style={styles.backRow} onPress={() => setSelectedWorkoutId(null)}>
            <Ionicons name="chevron-back" size={20} color={colors.xpBar} />
            <Text style={styles.backRowText}>All Workouts</Text>
          </TouchableOpacity>

          <View style={styles.readOnlyBanner}>
            <Ionicons
              name={readOnlyReason === 'completed' ? 'checkmark-circle' : readOnlyReason === 'notToday' ? 'calendar-outline' : readOnlyReason === 'expired' ? 'flag-outline' : 'archive-outline'}
              size={16}
              color={readOnlyReason === 'completed' ? colors.success : colors.textSecondary}
            />
            <Text style={styles.readOnlyBannerText}>
              {readOnlyReason === 'completed'
                ? "You've already completed this workout today — it reopens tomorrow."
                : readOnlyReason === 'notToday'
                ? `Not scheduled for today — comes back on ${scheduledDaysLabel(selectedWorkoutMeta?.scheduled_days ?? [])}.`
                : readOnlyReason === 'expired'
                ? `This program's assigned duration ended ${formatWorkoutEndDate(selectedWorkoutMeta!)} — ask your coach for a new one.`
                : 'This workout is no longer active — view only.'}
            </Text>
          </View>

          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.programLabel}>
                  {readOnlyReason === 'completed' ? 'COMPLETED TODAY' : readOnlyReason === 'notToday' ? 'NOT SCHEDULED TODAY' : readOnlyReason === 'expired' ? 'PROGRAM ENDED' : 'PAST WORKOUT'}
                </Text>
                <Text style={styles.workoutName}>{dbWorkout.name}</Text>
                <Text style={styles.workoutMeta}>
                  {dbWorkout.exercises.length} exercises • {dbWorkout.duration} • {dbWorkout.difficulty}
                  {selectedWorkoutMeta?.duration_weeks != null ? ` • ${durationWeeksLabel(selectedWorkoutMeta.duration_weeks)}` : ''}
                </Text>
              </View>
              {weekProgress && (
                <View style={styles.weekProgressBadge}>
                  <Text style={styles.weekProgressBadgeText}>{weekProgress.current}/{weekProgress.total}</Text>
                  <Text style={styles.weekProgressBadgeLabel}>WEEK</Text>
                </View>
              )}
            </View>
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {sessionActive ? (
          <View style={[styles.backRow, styles.backRowLocked]}>
            <Ionicons name="lock-closed" size={14} color={colors.textSecondary} />
            <Text style={styles.backRowLockedText}>Workout in progress — finish to switch</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.backRow} onPress={() => setSelectedWorkoutId(null)}>
            <Ionicons name="chevron-back" size={20} color={colors.xpBar} />
            <Text style={styles.backRowText}>All Workouts</Text>
          </TouchableOpacity>
        )}

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.programLabel}>TODAY'S SESSION</Text>
              <Text style={styles.workoutName}>{dbWorkout.name}</Text>
              <Text style={styles.workoutMeta}>
                {dbWorkout.exercises.length} exercises • {dbWorkout.duration} • {dbWorkout.difficulty}
                {selectedWorkoutMeta?.duration_weeks != null ? ` • ${durationWeeksLabel(selectedWorkoutMeta.duration_weeks)}` : ''}
              </Text>
            </View>
            {weekProgress && (
              <View style={styles.weekProgressBadge}>
                <Text style={styles.weekProgressBadgeText}>{weekProgress.current}/{weekProgress.total}</Text>
                <Text style={styles.weekProgressBadgeLabel}>WEEK</Text>
              </View>
            )}
          </View>
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

        {/* Effort scale key — moved up here (was at the bottom, after every
            exercise card) so the trainee can see what each effort number
            means before they start tapping, not just after scrolling past
            the whole workout. */}
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

        {/* Exercise cards */}
        <Text style={styles.sectionTitle}>EXERCISES</Text>
        {exercises.map((exercise, exIndex) => {
          const isPastLocked = exIndex < activeExerciseIndex;
          const isFutureLocked = exIndex > activeExerciseIndex;
          const isLocked = isPastLocked || isFutureLocked;
          // Reordering is only offered among exercises not yet completed —
          // the in-order completion lock already fixes everything before
          // activeExerciseIndex in place, so letting those move too would
          // just silently undo work already logged against them.
          const canReorder = exIndex >= activeExerciseIndex && !submitted;
          const canMoveUp = canReorder && exIndex > activeExerciseIndex;
          const canMoveDown = canReorder && exIndex < exercises.length - 1;
          return (
          <View
            key={exercise.id}
            style={[styles.exerciseCard, exercise.completed && styles.exerciseCardDone, isFutureLocked && styles.exerciseCardLocked]}
          >
            {/* Exercise header row */}
            <View style={styles.exerciseHeaderRow}>
              <View style={styles.exerciseNumber}>
                <Text style={styles.exerciseNumberText}>{exIndex + 1}</Text>
              </View>
              <Text style={[styles.exerciseName, exercise.completed && styles.exerciseNameDone]}>
                {exercise.name}
              </Text>
              {exercise.laterality && (
                <View style={styles.lateralityBadge}>
                  <Ionicons name="swap-horizontal" size={12} color={colors.primary} />
                  <Text style={styles.lateralityBadgeText}>
                    {exercise.laterality === 'single_arm' ? 'Each Arm' : 'Each Leg'}
                  </Text>
                </View>
              )}
              {exercise.coachTime && exercise.coachTime !== '0' && (
                <View style={styles.exerciseTimeBadge}>
                  <Ionicons name="time-outline" size={12} color={colors.xpBar} />
                  <Text style={styles.exerciseTimeBadgeText}>{exercise.coachTime}</Text>
                </View>
              )}
              {canReorder && (
                <View style={styles.reorderCol}>
                  <TouchableOpacity
                    style={[styles.reorderBtn, !canMoveUp && styles.reorderBtnDisabled]}
                    onPress={() => reorderExercise(exercise.id, 'up')}
                    disabled={!canMoveUp}
                    hitSlop={{ top: 4, bottom: 2, left: 8, right: 8 }}
                  >
                    <Ionicons name="chevron-up" size={14} color={canMoveUp ? colors.textSecondary : colors.border} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.reorderBtn, !canMoveDown && styles.reorderBtnDisabled]}
                    onPress={() => reorderExercise(exercise.id, 'down')}
                    disabled={!canMoveDown}
                    hitSlop={{ top: 2, bottom: 4, left: 8, right: 8 }}
                  >
                    <Ionicons name="chevron-down" size={14} color={canMoveDown ? colors.textSecondary : colors.border} />
                  </TouchableOpacity>
                </View>
              )}
              {isFutureLocked ? (
                <View style={styles.checkboxLocked}>
                  <Ionicons name="lock-closed" size={14} color={colors.textSecondary} />
                </View>
              ) : (
                // Status indicator only — not tappable. An exercise can only be
                // marked done by actually logging effort on every set (see the
                // auto-tick effect above); a trainee can no longer tick the
                // whole exercise off early to skip filling in its sets.
                <View style={[styles.checkbox, exercise.completed && styles.checkboxDone]}>
                  {exercise.completed && <Ionicons name="checkmark" size={18} color={colors.text} />}
                </View>
              )}
            </View>

            {isFutureLocked && (
              <Text style={styles.exerciseLockedHint}>Complete the previous exercise to unlock</Text>
            )}

            {/* Set table header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.colHeader, styles.colSet]}>SET</Text>
              <Text style={[styles.colHeader, styles.colReps]}>REPS</Text>
              <Text style={[styles.colHeader, styles.colWeight]}>WEIGHT</Text>
              <Text style={[styles.colHeader, styles.colEffort]}>EFFORT</Text>
            </View>

            {/* Set rows — must be logged in order too: only the first not-yet-logged
                set in the active exercise is interactive, same locking pattern as exercises. */}
            {(() => {
              const firstUnloggedSetIndex = exercise.sets.findIndex(s => s.effort === null);
              const activeSetIndex = firstUnloggedSetIndex === -1 ? exercise.sets.length : firstUnloggedSetIndex;
              return exercise.sets.map((set, setIndex) => {
                const isSetLocked = isLocked || setIndex !== activeSetIndex;
                return (
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
                          (isSetLocked || !!restTimer) && styles.effortBtnLocked,
                        ]}
                        disabled={isSetLocked || !!restTimer}
                        onPress={() => setEffort(exercise.id, setIndex, level)}
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
                );
              });
            })()}

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
          );
        })}

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
    </View>
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
  backRowLocked: { gap: 6 },
  backRowLockedText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

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
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  programLabel: { fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 2, marginBottom: 6 },
  workoutName: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 6 },
  workoutMeta: { fontSize: 13, color: colors.textSecondary },
  weekProgressBadge: {
    alignItems: 'center', backgroundColor: colors.secondary, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8, marginLeft: 12,
  },
  weekProgressBadgeText: { fontSize: 18, fontWeight: '800', color: colors.xpBar },
  weekProgressBadgeLabel: { fontSize: 9, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, marginTop: 1 },

  progressSection: { marginBottom: 20 },
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
  exerciseCardDone: { borderColor: colors.xpBar + '66', backgroundColor: '#0a2027' },
  exerciseCardLocked: { opacity: 0.45 },

  exerciseHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  exerciseTimeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.xpBar + '22', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  exerciseTimeBadgeText: { fontSize: 12, fontWeight: '700', color: colors.xpBar },
  lateralityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.primary + '22', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  lateralityBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  reorderCol: { gap: 2 },
  reorderBtn: {
    width: 22, height: 16, borderRadius: 4,
    backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center',
  },
  reorderBtnDisabled: { opacity: 0.4 },
  exerciseNumber: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  exerciseNumberText: { fontSize: 14, fontWeight: '700', color: colors.xpBar },
  exerciseName: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  exerciseNameDone: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  exerciseLockedHint: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', marginTop: -8, marginBottom: 14 },

  checkbox: {
    width: 36, height: 36, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: colors.xpBar, borderColor: colors.xpBar },
  checkboxLocked: {
    width: 36, height: 36, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

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
  effortBtnLocked: { opacity: 0.35 },

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
