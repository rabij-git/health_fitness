import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import {
  getPrograms,
  createProgram,
  getMyTrainees,
  getPendingTrainees,
  assignTraineeToCoach,
  createWorkout,
  updateWorkoutExercises,
  getWorkoutWithExercises,
  getTraineeHistory,
  getWeightLogs,
} from '../../lib/db';
import { DBProgram, DBUser, DBWorkout, DBExercise, DBWeightLog } from '../../lib/supabase';

interface ExerciseEntry {
  id: string;
  name: string;
  sets: string;
  reps: string;
  weight: string;
}

interface Props {
  coachId: string;
}

function buildEmptyExercise(): ExerciseEntry {
  return { id: String(Date.now() + Math.random()), name: '', sets: '3', reps: '10', weight: '' };
}

const SUGGESTED_EXERCISES: { category: string; icon: string; items: { name: string; sets: string; reps: string; weight: string }[] }[] = [
  {
    category: 'Push', icon: 'arrow-up-circle',
    items: [
      { name: 'Barbell Bench Press', sets: '4', reps: '8', weight: '80kg' },
      { name: 'Overhead Press', sets: '3', reps: '10', weight: '50kg' },
      { name: 'Incline Dumbbell Press', sets: '3', reps: '10', weight: '24kg' },
      { name: 'Cable Lateral Raises', sets: '3', reps: '15', weight: '10kg' },
      { name: 'Tricep Dips', sets: '3', reps: '12', weight: '' },
      { name: 'Push-ups', sets: '3', reps: '15', weight: '' },
    ],
  },
  {
    category: 'Pull', icon: 'arrow-down-circle',
    items: [
      { name: 'Barbell Row', sets: '4', reps: '8', weight: '70kg' },
      { name: 'Pull-ups', sets: '3', reps: '8', weight: '' },
      { name: 'Lat Pulldown', sets: '3', reps: '10', weight: '60kg' },
      { name: 'Seated Cable Row', sets: '3', reps: '12', weight: '55kg' },
      { name: 'Face Pulls', sets: '3', reps: '15', weight: '20kg' },
      { name: 'Bicep Curls', sets: '3', reps: '12', weight: '16kg' },
    ],
  },
  {
    category: 'Legs', icon: 'fitness',
    items: [
      { name: 'Barbell Squat', sets: '4', reps: '6', weight: '100kg' },
      { name: 'Deadlift', sets: '4', reps: '5', weight: '120kg' },
      { name: 'Leg Press', sets: '3', reps: '10', weight: '150kg' },
      { name: 'Romanian Deadlift', sets: '3', reps: '10', weight: '80kg' },
      { name: 'Leg Curl', sets: '3', reps: '12', weight: '40kg' },
      { name: 'Calf Raises', sets: '4', reps: '15', weight: '60kg' },
    ],
  },
  {
    category: 'Core', icon: 'body',
    items: [
      { name: 'Plank', sets: '3', reps: '60s', weight: '' },
      { name: 'Hanging Leg Raises', sets: '3', reps: '12', weight: '' },
      { name: 'Cable Crunches', sets: '3', reps: '15', weight: '30kg' },
      { name: 'Russian Twists', sets: '3', reps: '20', weight: '10kg' },
    ],
  },
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function CoachPrograms({ coachId }: Props) {
  const [programs, setPrograms] = useState<DBProgram[]>([]);
  const [assignedTrainees, setAssignedTrainees] = useState<DBUser[]>([]);
  const [pendingTrainees, setPendingTrainees] = useState<DBUser[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Add Program modal ──
  const [showAddProgram, setShowAddProgram] = useState(false);
  const [newProgName, setNewProgName] = useState('');
  const [newProgDesc, setNewProgDesc] = useState('');
  const [newProgDuration, setNewProgDuration] = useState('');
  const [newProgDiff, setNewProgDiff] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');

  // ── Trainee detail modal ──
  const [selectedTrainee, setSelectedTrainee] = useState<DBUser | null>(null);
  const [detailTab, setDetailTab] = useState<'program' | 'history' | 'weight'>('program');
  const [selectedTraineeWorkout, setSelectedTraineeWorkout] = useState<{ workout: DBWorkout; exercises: DBExercise[] } | null>(null);
  const [selectedTraineeHistory, setSelectedTraineeHistory] = useState<any[]>([]);
  const [selectedTraineeWeights, setSelectedTraineeWeights] = useState<DBWeightLog[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ── Assign workout modal (3-step: program → workout → success) ──
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningTrainee, setAssigningTrainee] = useState<DBUser | null>(null);
  const [assignStep, setAssignStep] = useState<1 | 2 | 3>(1);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [workoutName, setWorkoutName] = useState('Day 1 Workout');
  const [exercises, setExercises] = useState<ExerciseEntry[]>([buildEmptyExercise()]);
  const [activeCategory, setActiveCategory] = useState('Push');

  // ── Edit workout modal ──
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTrainee, setEditingTrainee] = useState<DBUser | null>(null);
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editWorkoutName, setEditWorkoutName] = useState('');
  const [editExercises, setEditExercises] = useState<ExerciseEntry[]>([]);
  const [editActiveCategory, setEditActiveCategory] = useState('Push');

  const allTrainees = [
    ...assignedTrainees,
    ...pendingTrainees.filter(pt => !assignedTrainees.find(a => a.id === pt.id)),
  ];

  // ── Load data ──
  const loadPrograms = useCallback(async () => {
    const progs = await getPrograms(coachId);
    setPrograms(progs);
  }, [coachId]);

  const loadTrainees = useCallback(async () => {
    const [assigned, pending] = await Promise.all([
      getMyTrainees(coachId),
      getPendingTrainees(),
    ]);
    setAssignedTrainees(assigned);
    // Show all unassigned pending trainees so coach can claim them
    setPendingTrainees(pending.filter(p => !p.coach_id));
  }, [coachId]);

  useEffect(() => {
    loadPrograms();
    loadTrainees();
  }, [loadPrograms, loadTrainees]);

  // Load detail data when a trainee is selected
  useEffect(() => {
    if (!selectedTrainee || selectedTrainee.status !== 'assigned') {
      setSelectedTraineeWorkout(null);
      setSelectedTraineeHistory([]);
      setSelectedTraineeWeights([]);
      return;
    }
    setLoadingDetail(true);
    Promise.all([
      getWorkoutWithExercises(selectedTrainee.id),
      getTraineeHistory(selectedTrainee.id),
      getWeightLogs(selectedTrainee.id),
    ]).then(([wkt, history, weights]) => {
      setSelectedTraineeWorkout(wkt);
      setSelectedTraineeHistory(history);
      setSelectedTraineeWeights(weights);
      setLoadingDetail(false);
    });
  }, [selectedTrainee]);

  // ── Add Program ──
  const saveNewProgram = async () => {
    if (!newProgName.trim() || saving) return;
    setSaving(true);
    try {
      await createProgram({
        name: newProgName.trim(),
        description: newProgDesc.trim() || 'Custom program',
        duration: newProgDuration.trim() || '8 weeks',
        difficulty: newProgDiff,
        coach_id: coachId,
      });
      await loadPrograms();
      setShowAddProgram(false);
      setNewProgName('');
      setNewProgDesc('');
      setNewProgDuration('');
      setNewProgDiff('Intermediate');
    } catch (e) {
      console.warn('createProgram error', e);
    } finally {
      setSaving(false);
    }
  };

  // ── Assign flow ──
  const openAssignModal = (trainee: DBUser) => {
    setAssigningTrainee(trainee);
    setAssignStep(1);
    setSelectedProgramId(null);
    setWorkoutName('Day 1 Workout');
    setExercises([buildEmptyExercise()]);
    setActiveCategory('Push');
    setShowAssignModal(true);
  };

  const addSuggestedExercise = useCallback((item: { name: string; sets: string; reps: string; weight: string }) => {
    setExercises(prev => {
      const lastIdx = prev.length - 1;
      if (prev[lastIdx] && !prev[lastIdx].name.trim()) {
        return prev.map((e, i) => i === lastIdx ? { ...e, ...item, id: e.id } : e);
      }
      return [...prev, { id: String(Date.now() + Math.random()), ...item }];
    });
  }, []);

  const handleAssignNext = async () => {
    if (assignStep === 1 && selectedProgramId) {
      setAssignStep(2);
    } else if (assignStep === 2 && !saving) {
      const selProgram = programs.find(p => p.id === selectedProgramId)!;
      const exs = exercises.filter(e => e.name.trim()).map((e, i) => ({
        name: e.name,
        sets: parseInt(e.sets) || 3,
        reps: e.reps,
        weight: e.weight || undefined,
        sort_order: i,
      }));
      setSaving(true);
      try {
        await createWorkout({
          trainee_id: assigningTrainee!.id,
          program_id: selectedProgramId!,
          name: workoutName,
          description: 'Assigned by coach',
          duration: '60 min',
          difficulty: selProgram.difficulty,
        }, exs);
        await assignTraineeToCoach(assigningTrainee!.id, coachId);
        // Update state locally to avoid a full refetch
        const assigned = { ...assigningTrainee!, coach_id: coachId, status: 'assigned' as const };
        setAssignedTrainees(prev => [...prev, assigned]);
        setPendingTrainees(prev => prev.filter(p => p.id !== assigningTrainee!.id));
        setAssignStep(3);
      } catch (e) {
        console.warn('assign error', e);
      } finally {
        setSaving(false);
      }
    }
  };

  // ── Edit flow ──
  const openEditModal = (trainee: DBUser) => {
    setEditingTrainee(trainee);
    const wkt = selectedTraineeWorkout;
    setEditingWorkoutId(wkt?.workout.id ?? null);
    setEditWorkoutName(wkt?.workout.name ?? 'Day 1 Workout');
    setEditExercises(
      (wkt?.exercises ?? []).map((ex, i) => ({
        id: String(i) + ex.name,
        name: ex.name,
        sets: String(ex.sets),
        reps: ex.reps,
        weight: ex.weight ?? '',
      }))
    );
    setEditActiveCategory('Push');
    setShowEditModal(true);
  };

  const addEditSuggestedExercise = useCallback((item: { name: string; sets: string; reps: string; weight: string }) => {
    setEditExercises(prev => {
      const lastIdx = prev.length - 1;
      if (prev[lastIdx] && !prev[lastIdx].name.trim()) {
        return prev.map((e, i) => i === lastIdx ? { ...e, ...item, id: e.id } : e);
      }
      return [...prev, { id: String(Date.now() + Math.random()), ...item }];
    });
  }, []);

  const saveEdit = async () => {
    if (!editingTrainee || !editingWorkoutId || saving) return;
    const exs = editExercises.filter(e => e.name.trim()).map((e, i) => ({
      name: e.name,
      sets: parseInt(e.sets) || 3,
      reps: e.reps,
      weight: e.weight || undefined,
      sort_order: i,
    }));
    setSaving(true);
    try {
      await updateWorkoutExercises(editingWorkoutId, exs);
      // Refresh detail if the edited trainee is still selected
      if (selectedTrainee?.id === editingTrainee.id) {
        const wkt = await getWorkoutWithExercises(editingTrainee.id);
        setSelectedTraineeWorkout(wkt);
      }
      setShowEditModal(false);
      setEditingTrainee(null);
      setEditingWorkoutId(null);
    } catch (e) {
      console.warn('saveEdit error', e);
    } finally {
      setSaving(false);
    }
  };

  const selectedProgram = programs.find(p => p.id === selectedProgramId);
  const step2Valid = workoutName.trim().length > 0 && exercises.some(e => e.name.trim());
  const activeCategoryItems = useMemo(
    () => SUGGESTED_EXERCISES.find(c => c.category === activeCategory)?.items ?? [],
    [activeCategory]
  );
  const editActiveCategoryItems = useMemo(
    () => SUGGESTED_EXERCISES.find(c => c.category === editActiveCategory)?.items ?? [],
    [editActiveCategory]
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Programs</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddProgram(true)}>
            <Ionicons name="add" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Programs list */}
        {programs.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No programs yet</Text>
            <Text style={styles.emptySub}>Tap + to create your first training program.</Text>
          </View>
        )}
        {programs.map((program) => (
          <TouchableOpacity key={program.id} style={styles.programCard} activeOpacity={0.8}>
            <View style={styles.programHeader}>
              <View style={styles.programIcon}>
                <Ionicons name="barbell" size={24} color={colors.primary} />
              </View>
              <View style={styles.programInfo}>
                <Text style={styles.programName}>{program.name}</Text>
                <View style={styles.badgeRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{program.duration}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: colors.accent + '66' }]}>
                    <Text style={[styles.badgeText, { color: colors.xpBar }]}>{program.difficulty}</Text>
                  </View>
                </View>
              </View>
            </View>
            <Text style={styles.programDesc}>{program.description}</Text>
            <View style={styles.programFooter}>
              <View style={styles.statItem}>
                <Ionicons name="people" size={14} color={colors.textSecondary} />
                <Text style={styles.statText}>
                  {assignedTrainees.length} trainees
                </Text>
              </View>
              <View style={styles.viewDetailsRow}>
                <Text style={styles.viewDetailsText}>View Details</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {/* Trainees section */}
        <Text style={styles.sectionLabel}>TRAINEES ({allTrainees.length})</Text>
        {allTrainees.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No trainees yet</Text>
            <Text style={styles.emptySub}>Ask your trainees to sign up using the Trainee role on the login screen.</Text>
          </View>
        )}

        {allTrainees.map(t => {
          const isAssigned = t.status === 'assigned';
          return (
            <TouchableOpacity
              key={t.id}
              style={styles.traineeCard}
              onPress={() => { setSelectedTrainee(t); setDetailTab('program'); }}
              activeOpacity={0.8}
            >
              <View style={[styles.traineeAvatar, isAssigned && styles.traineeAvatarAssigned]}>
                <Text style={[styles.traineeAvatarText, isAssigned && { color: colors.xpBar }]}>{t.avatar}</Text>
              </View>
              <View style={styles.traineeInfo}>
                <Text style={styles.traineeName}>{t.name}</Text>
                <Text style={styles.traineeEmail}>{t.email}</Text>
                {isAssigned && (
                  <Text style={styles.traineeProg}>Program Active</Text>
                )}
              </View>
              {isAssigned ? (
                <View style={styles.traineeActions}>
                  <View style={styles.assignedBadge}>
                    <View style={styles.assignedDot} />
                    <Text style={styles.assignedText}>Active</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.assignBtn}
                  onPress={() => openAssignModal(t)}
                >
                  <Text style={styles.assignBtnText}>Assign</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Add Program Modal ── */}
      <Modal visible={showAddProgram} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Program</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setShowAddProgram(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>PROGRAM NAME</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Strength Builder Pro"
                placeholderTextColor={colors.textSecondary}
                value={newProgName}
                onChangeText={setNewProgName}
                autoFocus
              />
              <Text style={styles.fieldLabel}>DESCRIPTION</Text>
              <TextInput
                style={[styles.textInput, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Describe the program..."
                placeholderTextColor={colors.textSecondary}
                value={newProgDesc}
                onChangeText={setNewProgDesc}
                multiline
              />
              <Text style={styles.fieldLabel}>DURATION</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 12 weeks"
                placeholderTextColor={colors.textSecondary}
                value={newProgDuration}
                onChangeText={setNewProgDuration}
              />
              <Text style={styles.fieldLabel}>DIFFICULTY</Text>
              <View style={styles.diffRow}>
                {(['Beginner', 'Intermediate', 'Advanced'] as const).map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.diffChip, newProgDiff === d && styles.diffChipActive]}
                    onPress={() => setNewProgDiff(d)}
                  >
                    <Text style={[styles.diffChipText, newProgDiff === d && styles.diffChipTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setShowAddProgram(false)}>
                <Text style={styles.backBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, (!newProgName.trim() || saving) && styles.nextBtnDisabled]}
                onPress={saveNewProgram}
                disabled={!newProgName.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={18} color={colors.text} />
                    <Text style={styles.nextBtnText}>Create Program</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Trainee Detail Modal ── */}
      <Modal visible={!!selectedTrainee} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '92%' }]}>
            {/* Header */}
            <View style={styles.detailHeader}>
              <View style={[styles.detailAvatar, selectedTrainee?.status === 'assigned' && styles.detailAvatarAssigned]}>
                <Text style={styles.detailAvatarText}>{selectedTrainee?.avatar}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailName}>{selectedTrainee?.name}</Text>
                <Text style={styles.detailEmail}>{selectedTrainee?.email}</Text>
                {selectedTrainee?.status === 'assigned' && selectedTraineeWorkout && (
                  <Text style={styles.detailProg}>
                    {programs.find(p => p.id === selectedTraineeWorkout.workout.program_id)?.name ?? 'Program Active'}
                  </Text>
                )}
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedTrainee(null)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Status badge */}
            <View style={styles.statusRow}>
              <View style={[
                styles.statusBadge,
                selectedTrainee?.status === 'assigned' ? styles.statusBadgeActive : styles.statusBadgePending,
              ]}>
                <View style={[
                  styles.statusDot,
                  { backgroundColor: selectedTrainee?.status === 'assigned' ? colors.success : colors.warning },
                ]} />
                <Text style={[
                  styles.statusText,
                  { color: selectedTrainee?.status === 'assigned' ? colors.success : colors.warning },
                ]}>
                  {selectedTrainee?.status === 'assigned' ? 'Assigned' : 'Pending Assignment'}
                </Text>
              </View>
              {selectedTrainee?.status === 'assigned' && (
                <TouchableOpacity
                  style={styles.editProgramBtn}
                  onPress={() => {
                    setSelectedTrainee(null);
                    openEditModal(selectedTrainee!);
                  }}
                >
                  <Ionicons name="create-outline" size={16} color={colors.xpBar} />
                  <Text style={styles.editProgramBtnText}>Edit Program</Text>
                </TouchableOpacity>
              )}
              {selectedTrainee?.status === 'pending' && (
                <TouchableOpacity
                  style={styles.editProgramBtn}
                  onPress={() => {
                    setSelectedTrainee(null);
                    openAssignModal(selectedTrainee!);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={16} color={colors.xpBar} />
                  <Text style={styles.editProgramBtnText}>Assign Program</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Tabs */}
            {selectedTrainee?.status === 'assigned' && (
              <View style={styles.tabRow}>
                {(['program', 'history', 'weight'] as const).map(tab => (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.tab, detailTab === tab && styles.tabActive]}
                    onPress={() => setDetailTab(tab)}
                  >
                    <Text style={[styles.tabText, detailTab === tab && styles.tabTextActive]}>
                      {tab === 'program' ? 'Program' : tab === 'history' ? 'History' : 'Weight'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {loadingDetail ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {/* Program tab */}
                {(detailTab === 'program' || selectedTrainee?.status === 'pending') && (
                  <View>
                    {selectedTrainee?.status === 'pending' ? (
                      <View style={styles.pendingBlock}>
                        <Ionicons name="time-outline" size={40} color={colors.warning} />
                        <Text style={styles.pendingTitle}>No Program Yet</Text>
                        <Text style={styles.pendingSubtitle}>Assign a program to get this trainee started.</Text>
                      </View>
                    ) : selectedTraineeWorkout ? (
                      <>
                        <Text style={styles.fieldLabel}>CURRENT WORKOUT</Text>
                        <View style={styles.workoutBlock}>
                          <Text style={styles.workoutBlockName}>{selectedTraineeWorkout.workout.name}</Text>
                          <Text style={styles.workoutBlockMeta}>
                            {selectedTraineeWorkout.exercises.length} exercises · {selectedTraineeWorkout.workout.duration}
                          </Text>
                        </View>
                        {selectedTraineeWorkout.exercises.map((ex, i) => (
                          <View key={ex.id} style={styles.exDetailRow}>
                            <View style={styles.exDetailNum}>
                              <Text style={styles.exDetailNumText}>{i + 1}</Text>
                            </View>
                            <Text style={styles.exDetailName}>{ex.name}</Text>
                            <Text style={styles.exDetailMeta}>{ex.sets}×{ex.reps}</Text>
                            {ex.weight && <Text style={styles.exDetailWeight}>{ex.weight}</Text>}
                          </View>
                        ))}
                      </>
                    ) : (
                      <View style={styles.pendingBlock}>
                        <Ionicons name="barbell-outline" size={40} color={colors.textSecondary} />
                        <Text style={styles.pendingTitle}>No Workout Loaded</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* History tab */}
                {detailTab === 'history' && selectedTrainee?.status === 'assigned' && (
                  <View>
                    <Text style={styles.fieldLabel}>TRAINING HISTORY</Text>
                    {selectedTraineeHistory.length === 0 && (
                      <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 }}>No sessions logged yet</Text>
                    )}
                    {selectedTraineeHistory.map((entry, i) => (
                      <View key={i} style={styles.historyRow}>
                        <View style={styles.historyDate}>
                          <Text style={styles.historyDateText}>{formatDate(entry.completed_at)}</Text>
                        </View>
                        <View style={styles.historyInfo}>
                          <Text style={styles.historyWorkout}>{entry.workout_name}</Text>
                          <Text style={styles.historyMeta}>{entry.completion_pct}% complete</Text>
                        </View>
                        <View style={[
                          styles.completionBadge,
                          { backgroundColor: entry.completion_pct >= 100 ? colors.success + '22' : colors.warning + '22' },
                        ]}>
                          <Text style={[
                            styles.completionText,
                            { color: entry.completion_pct >= 100 ? colors.success : colors.warning },
                          ]}>
                            {entry.completion_pct}%
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Weight tab */}
                {detailTab === 'weight' && selectedTrainee?.status === 'assigned' && (
                  <View>
                    <Text style={styles.fieldLabel}>WEIGHT LOG</Text>
                    {selectedTraineeWeights.length === 0 && (
                      <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 }}>No weight entries yet</Text>
                    )}
                    {selectedTraineeWeights.map((entry, i) => (
                      <View key={entry.id} style={styles.weightRow}>
                        <Ionicons name="scale-outline" size={16} color={colors.xpBar} />
                        <Text style={styles.weightDate}>{formatDate(entry.logged_at)}</Text>
                        <Text style={styles.weightVal}>{entry.weight_kg} kg</Text>
                        {i === 0 && (
                          <View style={styles.latestTag}>
                            <Text style={styles.latestTagText}>Latest</Text>
                          </View>
                        )}
                      </View>
                    ))}
                    {selectedTraineeWeights.length >= 2 && (() => {
                      const latest = selectedTraineeWeights[0].weight_kg;
                      const oldest = selectedTraineeWeights[selectedTraineeWeights.length - 1].weight_kg;
                      const diff = latest - oldest;
                      const isDown = diff < 0;
                      return (
                        <View style={styles.weightTrend}>
                          <Ionicons name={isDown ? 'trending-down' : 'trending-up'} size={16} color={isDown ? colors.success : colors.primary} />
                          <Text style={[styles.weightTrendText, { color: isDown ? colors.success : colors.primary }]}>
                            {isDown ? '' : '+'}{diff.toFixed(1)} kg overall
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Assign Workout Modal (3-step) ── */}
      <Modal visible={showAssignModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalStep}>STEP {assignStep} OF 3 · {assigningTrainee?.name}</Text>
                <Text style={styles.modalTitle}>
                  {assignStep === 1 ? 'Select Program' : assignStep === 2 ? 'Build Workout' : 'All Set!'}
                </Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setShowAssignModal(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.stepRow}>
              {[1, 2, 3].map(s => (
                <View key={s} style={[styles.stepDot, s <= assignStep && styles.stepDotActive]} />
              ))}
            </View>

            {/* Step 1 — Select Program */}
            {assignStep === 1 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>SELECT PROGRAM</Text>
                {programs.length === 0 && (
                  <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 }}>
                    No programs yet — create one first using the + button.
                  </Text>
                )}
                {programs.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.programOption, selectedProgramId === p.id && styles.programOptionSelected]}
                    onPress={() => setSelectedProgramId(p.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.programOptionLeft}>
                      <Ionicons
                        name="barbell"
                        size={18}
                        color={selectedProgramId === p.id ? colors.xpBar : colors.textSecondary}
                      />
                      <View>
                        <Text style={[styles.programOptionName, selectedProgramId === p.id && { color: colors.xpBar }]}>
                          {p.name}
                        </Text>
                        <Text style={styles.programOptionMeta}>{p.duration} · {p.difficulty}</Text>
                      </View>
                    </View>
                    {selectedProgramId === p.id && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.xpBar} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Step 2 — Build Workout */}
            {assignStep === 2 && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.fieldLabel}>WORKOUT NAME</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Push Day A"
                  placeholderTextColor={colors.textSecondary}
                  value={workoutName}
                  onChangeText={setWorkoutName}
                />

                <Text style={[styles.fieldLabel, { marginTop: 20 }]}>SUGGESTED EXERCISES</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                  {SUGGESTED_EXERCISES.map(cat => (
                    <TouchableOpacity
                      key={cat.category}
                      style={[styles.categoryChip, activeCategory === cat.category && styles.categoryChipActive]}
                      onPress={() => setActiveCategory(cat.category)}
                    >
                      <Ionicons
                        name={cat.icon as any}
                        size={14}
                        color={activeCategory === cat.category ? colors.text : colors.textSecondary}
                      />
                      <Text style={[styles.categoryChipText, activeCategory === cat.category && styles.categoryChipTextActive]}>
                        {cat.category}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.suggestedGrid}>
                  {activeCategoryItems.map(item => {
                    const alreadyAdded = exercises.some(e => e.name === item.name);
                    return (
                      <TouchableOpacity
                        key={item.name}
                        style={[styles.suggestedChip, alreadyAdded && styles.suggestedChipAdded]}
                        onPress={() => !alreadyAdded && addSuggestedExercise(item)}
                        activeOpacity={alreadyAdded ? 1 : 0.7}
                      >
                        <Text style={[styles.suggestedChipText, alreadyAdded && styles.suggestedChipTextAdded]}>
                          {item.name}
                        </Text>
                        <Ionicons
                          name={alreadyAdded ? 'checkmark' : 'add'}
                          size={14}
                          color={alreadyAdded ? colors.xpBar : colors.textSecondary}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 20 }]}>YOUR EXERCISES</Text>
                {exercises.map((ex, i) => (
                  <View key={ex.id} style={styles.exerciseRow}>
                    <View style={styles.exNumBadge}>
                      <Text style={styles.exNumText}>{i + 1}</Text>
                    </View>
                    <View style={styles.exFields}>
                      <TextInput
                        style={[styles.textInput, { marginBottom: 8 }]}
                        placeholder="Exercise name"
                        placeholderTextColor={colors.textSecondary}
                        value={ex.name}
                        onChangeText={v => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, name: v } : e))}
                      />
                      <View style={styles.exMetaRow}>
                        <View style={styles.exMetaField}>
                          <Text style={styles.exMetaLabel}>SETS</Text>
                          <TextInput
                            style={styles.exMetaInput}
                            value={ex.sets}
                            onChangeText={v => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, sets: v.replace(/[^0-9]/g, '') } : e))}
                            keyboardType="number-pad"
                            placeholderTextColor={colors.textSecondary}
                          />
                        </View>
                        <View style={styles.exMetaField}>
                          <Text style={styles.exMetaLabel}>REPS</Text>
                          <TextInput
                            style={styles.exMetaInput}
                            value={ex.reps}
                            onChangeText={v => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, reps: v.replace(/[^0-9]/g, '') } : e))}
                            keyboardType="number-pad"
                            placeholderTextColor={colors.textSecondary}
                          />
                        </View>
                        <View style={styles.exMetaField}>
                          <Text style={styles.exMetaLabel}>WEIGHT</Text>
                          <TextInput
                            style={styles.exMetaInput}
                            value={ex.weight}
                            onChangeText={v => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, weight: v } : e))}
                            placeholder="60kg"
                            placeholderTextColor={colors.textSecondary}
                          />
                        </View>
                        {exercises.length > 1 && (
                          <TouchableOpacity
                            onPress={() => setExercises(prev => prev.filter(e => e.id !== ex.id))}
                            style={styles.removeBtn}
                          >
                            <Ionicons name="trash-outline" size={18} color={colors.primary} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={styles.addExerciseBtn}
                  onPress={() => setExercises(prev => [...prev, buildEmptyExercise()])}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.xpBar} />
                  <Text style={styles.addExerciseBtnText}>Add Exercise</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* Step 3 — Success */}
            {assignStep === 3 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.successIcon}>
                  <Ionicons name="checkmark-circle" size={64} color={colors.xpBar} />
                </View>
                <Text style={styles.successTitle}>All Set!</Text>
                <Text style={styles.successSub}>
                  {assigningTrainee?.name} has been assigned to {selectedProgram?.name} with their first workout ready.
                </Text>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <Ionicons name="person" size={16} color={colors.textSecondary} />
                    <Text style={styles.summaryText}>{assigningTrainee?.name}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Ionicons name="barbell" size={16} color={colors.textSecondary} />
                    <Text style={styles.summaryText}>{selectedProgram?.name}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Ionicons name="calendar" size={16} color={colors.textSecondary} />
                    <Text style={styles.summaryText}>
                      {workoutName} · {exercises.filter(e => e.name.trim()).length} exercises
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}

            {/* Footer */}
            <View style={styles.modalFooter}>
              {assignStep < 3 ? (
                <>
                  {assignStep > 1 && (
                    <TouchableOpacity style={styles.backBtn} onPress={() => setAssignStep(prev => (prev - 1) as 1 | 2 | 3)}>
                      <Text style={styles.backBtnText}>Back</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.nextBtn,
                      ((assignStep === 1 && !selectedProgramId) || (assignStep === 2 && (!step2Valid || saving))) && styles.nextBtnDisabled,
                    ]}
                    onPress={handleAssignNext}
                    disabled={(assignStep === 1 && !selectedProgramId) || (assignStep === 2 && (!step2Valid || saving))}
                  >
                    {saving && assignStep === 2 ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <>
                        <Text style={styles.nextBtnText}>{assignStep === 2 ? 'Assign' : 'Next'}</Text>
                        <Ionicons name="arrow-forward" size={18} color={colors.text} />
                      </>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.nextBtn} onPress={() => setShowAssignModal(false)}>
                  <Text style={styles.nextBtnText}>Done</Text>
                  <Ionicons name="checkmark" size={18} color={colors.text} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit Program Modal ── */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalStep}>EDITING PROGRAM</Text>
                <Text style={styles.modalTitle}>{editingTrainee?.name}</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>WORKOUT NAME</Text>
              <TextInput
                style={styles.textInput}
                value={editWorkoutName}
                onChangeText={setEditWorkoutName}
                placeholder="e.g. Push Day A"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>ADD EXERCISES</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {SUGGESTED_EXERCISES.map(cat => (
                  <TouchableOpacity
                    key={cat.category}
                    style={[styles.categoryChip, editActiveCategory === cat.category && styles.categoryChipActive]}
                    onPress={() => setEditActiveCategory(cat.category)}
                  >
                    <Ionicons
                      name={cat.icon as any}
                      size={14}
                      color={editActiveCategory === cat.category ? colors.text : colors.textSecondary}
                    />
                    <Text style={[styles.categoryChipText, editActiveCategory === cat.category && styles.categoryChipTextActive]}>
                      {cat.category}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.suggestedGrid}>
                {editActiveCategoryItems.map(item => {
                  const alreadyAdded = editExercises.some(e => e.name === item.name);
                  return (
                    <TouchableOpacity
                      key={item.name}
                      style={[styles.suggestedChip, alreadyAdded && styles.suggestedChipAdded]}
                      onPress={() => !alreadyAdded && addEditSuggestedExercise(item)}
                      activeOpacity={alreadyAdded ? 1 : 0.7}
                    >
                      <Text style={[styles.suggestedChipText, alreadyAdded && styles.suggestedChipTextAdded]}>
                        {item.name}
                      </Text>
                      <Ionicons
                        name={alreadyAdded ? 'checkmark' : 'add'}
                        size={14}
                        color={alreadyAdded ? colors.xpBar : colors.textSecondary}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>
                EXERCISES ({editExercises.filter(e => e.name.trim()).length})
              </Text>
              {editExercises.map((ex, i) => (
                <View key={ex.id} style={styles.exerciseRow}>
                  <View style={styles.exNumBadge}>
                    <Text style={styles.exNumText}>{i + 1}</Text>
                  </View>
                  <View style={styles.exFields}>
                    <TextInput
                      style={[styles.textInput, { marginBottom: 8 }]}
                      placeholder="Exercise name"
                      placeholderTextColor={colors.textSecondary}
                      value={ex.name}
                      onChangeText={v => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, name: v } : e))}
                    />
                    <View style={styles.exMetaRow}>
                      <View style={styles.exMetaField}>
                        <Text style={styles.exMetaLabel}>SETS</Text>
                        <TextInput
                          style={styles.exMetaInput}
                          value={ex.sets}
                          onChangeText={v => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, sets: v.replace(/[^0-9]/g, '') } : e))}
                          keyboardType="number-pad"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                      <View style={styles.exMetaField}>
                        <Text style={styles.exMetaLabel}>REPS</Text>
                        <TextInput
                          style={styles.exMetaInput}
                          value={ex.reps}
                          onChangeText={v => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, reps: v.replace(/[^0-9]/g, '') } : e))}
                          keyboardType="number-pad"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                      <View style={styles.exMetaField}>
                        <Text style={styles.exMetaLabel}>WEIGHT</Text>
                        <TextInput
                          style={styles.exMetaInput}
                          value={ex.weight}
                          onChangeText={v => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, weight: v } : e))}
                          placeholder="60kg"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => setEditExercises(prev => prev.filter(e => e.id !== ex.id))}
                        style={styles.removeBtn}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}

              <TouchableOpacity
                style={styles.addExerciseBtn}
                onPress={() => setEditExercises(prev => [...prev, buildEmptyExercise()])}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.xpBar} />
                <Text style={styles.addExerciseBtnText}>Add Exercise</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setShowEditModal(false)}>
                <Text style={styles.backBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, (!editExercises.some(e => e.name.trim()) || saving) && styles.nextBtnDisabled]}
                onPress={saveEdit}
                disabled={!editExercises.some(e => e.name.trim()) || saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color={colors.text} />
                    <Text style={styles.nextBtnText}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20, marginTop: 8,
  },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  addButton: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#FF8C00', alignItems: 'center',
    justifyContent: 'center', marginRight: 12,
  },

  // Program cards
  programCard: {
    backgroundColor: colors.card, borderRadius: 16,
    padding: 18, marginBottom: 14, borderWidth: 1, borderColor: colors.border,
  },
  programHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  programIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: colors.primary + '22',
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  programInfo: { flex: 1 },
  programName: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', gap: 8 },
  badge: { backgroundColor: colors.primary + '33', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  programDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 14 },
  programFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 13, color: colors.textSecondary },
  viewDetailsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewDetailsText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  // Trainees section
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1.5, marginBottom: 12, marginTop: 8,
  },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
  traineeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: colors.border,
  },
  traineeAvatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.secondary, alignItems: 'center',
    justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: colors.border,
  },
  traineeAvatarAssigned: { backgroundColor: colors.xpBar + '22', borderColor: colors.xpBar + '66' },
  traineeAvatarText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  traineeInfo: { flex: 1 },
  traineeName: { fontSize: 15, fontWeight: '700', color: colors.text },
  traineeEmail: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  traineeProg: { fontSize: 12, color: colors.xpBar, marginTop: 2, fontWeight: '600' },
  traineeActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  assignedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.success + '22',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  assignedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  assignedText: { fontSize: 11, color: colors.success, fontWeight: '600' },
  assignBtn: {
    backgroundColor: colors.primary, paddingHorizontal: 14,
    paddingVertical: 8, borderRadius: 10,
  },
  assignBtnText: { color: colors.text, fontSize: 12, fontWeight: '700' },

  // Modal base
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 28,
    borderTopRightRadius: 28, padding: 24, maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 20,
  },
  modalStep: { fontSize: 11, fontWeight: '700', color: colors.xpBar, letterSpacing: 1.5, marginBottom: 4 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center',
  },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  stepDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  stepDotActive: { backgroundColor: colors.xpBar },
  modalFooter: { flexDirection: 'row', gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },

  // Inputs
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1.5, marginBottom: 8 },
  textInput: {
    backgroundColor: colors.secondary, borderRadius: 12, padding: 14,
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border, marginBottom: 4,
  },

  // Difficulty chips
  diffRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  diffChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.secondary, alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  diffChipActive: { borderColor: colors.xpBar, backgroundColor: colors.xpBar + '22' },
  diffChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  diffChipTextActive: { color: colors.xpBar },

  // Program options
  programOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.secondary, borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1.5, borderColor: colors.border,
  },
  programOptionSelected: { borderColor: colors.xpBar, backgroundColor: '#0a1f1a' },
  programOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  programOptionName: { fontSize: 15, fontWeight: '700', color: colors.text },
  programOptionMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Exercise builder
  categoryRow: { marginBottom: 12 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.secondary, marginRight: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  categoryChipTextActive: { color: colors.text },
  suggestedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  suggestedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border,
  },
  suggestedChipAdded: { borderColor: colors.xpBar, backgroundColor: colors.xpBar + '22' },
  suggestedChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  suggestedChipTextAdded: { color: colors.xpBar },
  exerciseRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  exNumBadge: {
    width: 28, height: 28, borderRadius: 8, marginTop: 14,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  exNumText: { fontSize: 13, fontWeight: '700', color: colors.xpBar },
  exFields: { flex: 1 },
  exMetaRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  exMetaField: { flex: 1 },
  exMetaLabel: { fontSize: 9, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, marginBottom: 4 },
  exMetaInput: {
    backgroundColor: colors.secondary, borderRadius: 8, padding: 10,
    color: colors.text, fontSize: 13, borderWidth: 1, borderColor: colors.border, textAlign: 'center',
  },
  removeBtn: { padding: 8 },
  addExerciseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.xpBar, borderStyle: 'dashed',
    marginTop: 4, marginBottom: 16,
  },
  addExerciseBtnText: { fontSize: 14, fontWeight: '700', color: colors.xpBar },

  // Success step
  successIcon: { alignItems: 'center', marginVertical: 20 },
  successTitle: { fontSize: 24, fontWeight: '900', color: colors.text, textAlign: 'center', marginBottom: 8 },
  successSub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  summaryCard: {
    backgroundColor: colors.secondary, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, gap: 12,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryText: { fontSize: 14, color: colors.text, fontWeight: '600' },

  // Nav buttons
  backBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 12,
    backgroundColor: colors.secondary, alignItems: 'center',
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  nextBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: 12, backgroundColor: colors.primary,
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontSize: 15, fontWeight: '700', color: colors.text },

  // Trainee detail modal
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  detailAvatar: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: colors.secondary, alignItems: 'center',
    justifyContent: 'center', borderWidth: 2, borderColor: colors.border,
  },
  detailAvatarAssigned: { backgroundColor: colors.xpBar + '22', borderColor: colors.xpBar },
  detailAvatarText: { fontSize: 17, fontWeight: '800', color: colors.text },
  detailName: { fontSize: 19, fontWeight: '800', color: colors.text },
  detailEmail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  detailProg: { fontSize: 13, color: colors.xpBar, fontWeight: '600', marginTop: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  statusBadgeActive: { backgroundColor: colors.success + '22' },
  statusBadgePending: { backgroundColor: colors.warning + '22' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  editProgramBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.xpBar + '22', paddingHorizontal: 12,
    paddingVertical: 7, borderRadius: 10,
  },
  editProgramBtnText: { fontSize: 13, fontWeight: '700', color: colors.xpBar },
  tabRow: {
    flexDirection: 'row', backgroundColor: colors.secondary,
    borderRadius: 12, padding: 4, marginBottom: 18,
    borderWidth: 1, borderColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.text },

  // Program detail
  workoutBlock: {
    backgroundColor: colors.secondary, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.border, marginBottom: 12,
  },
  workoutBlockName: { fontSize: 16, fontWeight: '700', color: colors.text },
  workoutBlockMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  exDetailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  exDetailNum: {
    width: 24, height: 24, borderRadius: 6, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  exDetailNumText: { fontSize: 11, fontWeight: '700', color: colors.xpBar },
  exDetailName: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '500' },
  exDetailMeta: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  exDetailWeight: { fontSize: 12, color: colors.xpBar, fontWeight: '600' },

  // History tab
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12,
  },
  historyDate: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center',
  },
  historyDateText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },
  historyInfo: { flex: 1 },
  historyWorkout: { fontSize: 14, fontWeight: '700', color: colors.text },
  historyMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  completionBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  completionText: { fontSize: 13, fontWeight: '800' },

  // Weight tab
  weightRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  weightDate: { flex: 1, fontSize: 14, color: colors.textSecondary },
  weightVal: { fontSize: 16, fontWeight: '700', color: colors.text },
  latestTag: { backgroundColor: colors.xpBar + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  latestTagText: { fontSize: 10, fontWeight: '800', color: colors.xpBar },
  weightTrend: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border,
  },
  weightTrendText: { fontSize: 13, fontWeight: '600' },

  // Pending block
  pendingBlock: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  pendingTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  pendingSubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
});
