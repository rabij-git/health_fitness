import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { colors } from '../../theme/colors';
import {
  getMyTrainees,
  getIncomingCoachRequests,
  getOutgoingCoachRequests,
  searchUnassignedTrainees,
  sendCoachRequest,
  acceptCoachRequest,
  declineCoachRequest,
  getPrograms,
  getProgramExercises,
  getExerciseLibrary,
  createWorkout,
  updateWorkoutExercises,
  getWorkoutWithExercises,
  getTraineeHistory,
  getWeightLogs,
  getNutritionPlans,
  uploadNutritionPlan,
  deleteNutritionPlan,
  getMessages,
  sendMessage,
} from '../../lib/db';
import { DBProgram, DBUser, DBWorkout, DBExercise, DBWeightLog, DBNutritionPlan, DBCoachRequest, DBLibraryExercise, DBMessage } from '../../lib/supabase';
import { sanitizeCount, sanitizeWeightInput, stripKg, withKg } from '../../lib/exerciseInput';

interface ExerciseEntry {
  id: string;
  dbId?: string; // real DB row id when this entry was loaded from an existing exercises row
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

const CATEGORY_ICONS: Record<string, string> = {
  Push: 'arrow-up-circle',
  Pull: 'arrow-down-circle',
  Legs: 'fitness',
  Core: 'body',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function CoachTrainees({ coachId }: Props) {
  const [trainees, setTrainees] = useState<DBUser[]>([]);
  const [programs, setPrograms] = useState<DBProgram[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<(DBCoachRequest & { trainee: DBUser })[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<(DBCoachRequest & { trainee: DBUser })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // ── Find Trainee search modal ──
  const [showFindTrainee, setShowFindTrainee] = useState(false);
  const [traineeSearchQuery, setTraineeSearchQuery] = useState('');
  const [traineeSearchResults, setTraineeSearchResults] = useState<DBUser[]>([]);
  const [searchingTrainees, setSearchingTrainees] = useState(false);
  const [sendingRequestTo, setSendingRequestTo] = useState<string | null>(null);

  // ── Trainee detail modal ──
  const [selectedTrainee, setSelectedTrainee] = useState<DBUser | null>(null);
  const [detailTab, setDetailTab] = useState<'program' | 'history' | 'weight' | 'nutrition' | 'chat'>('program');
  const [selectedTraineeWorkout, setSelectedTraineeWorkout] = useState<{ workout: DBWorkout; exercises: DBExercise[] } | null>(null);
  const [selectedTraineeHistory, setSelectedTraineeHistory] = useState<any[]>([]);
  const [selectedTraineeWeights, setSelectedTraineeWeights] = useState<DBWeightLog[]>([]);
  const [selectedTraineeNutrition, setSelectedTraineeNutrition] = useState<DBNutritionPlan[]>([]);
  const [selectedTraineeMessages, setSelectedTraineeMessages] = useState<DBMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [uploadingNutrition, setUploadingNutrition] = useState(false);

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

  // ── Shared exercise library ──
  const [library, setLibrary] = useState<DBLibraryExercise[]>([]);
  const categories = useMemo(() => {
    const known = ['Push', 'Pull', 'Legs', 'Core'];
    return Array.from(new Set([...known, ...library.map(e => e.category)]));
  }, [library]);

  // ── Load data ──
  const loadData = useCallback(async () => {
    try {
      const [assigned, incoming, outgoing, progs] = await Promise.all([
        getMyTrainees(coachId),
        getIncomingCoachRequests(coachId),
        getOutgoingCoachRequests(coachId),
        getPrograms(coachId),
      ]);
      setTrainees(assigned);
      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);
      setPrograms(progs);
    } catch (e) {
      console.warn('CoachTrainees loadData error', e);
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    loadData();
    getExerciseLibrary().then(setLibrary);
  }, [loadData]);

  // Load detail data when a trainee is selected
  useEffect(() => {
    if (!selectedTrainee) {
      setSelectedTraineeWorkout(null);
      setSelectedTraineeHistory([]);
      setSelectedTraineeWeights([]);
      setSelectedTraineeNutrition([]);
      setSelectedTraineeMessages([]);
      return;
    }
    setLoadingDetail(true);
    Promise.all([
      getWorkoutWithExercises(selectedTrainee.id),
      getTraineeHistory(selectedTrainee.id),
      getWeightLogs(selectedTrainee.id),
      getNutritionPlans(selectedTrainee.id),
      getMessages(coachId, selectedTrainee.id),
    ]).then(([wkt, history, weights, nutrition, messages]) => {
      setSelectedTraineeWorkout(wkt);
      setSelectedTraineeHistory(history);
      setSelectedTraineeWeights(weights);
      setSelectedTraineeNutrition(nutrition);
      setSelectedTraineeMessages(messages);
      setLoadingDetail(false);
    });
  }, [selectedTrainee, coachId]);

  const handleSendToTrainee = useCallback(async () => {
    if (!chatInput.trim() || !selectedTrainee) return;
    const text = chatInput.trim();
    setChatInput('');
    try {
      await sendMessage(coachId, selectedTrainee.id, text);
      const updated = await getMessages(coachId, selectedTrainee.id);
      setSelectedTraineeMessages(updated);
    } catch (e) {
      console.warn('Send message error', e);
    }
  }, [coachId, selectedTrainee, chatInput]);

  const handleUploadNutrition = useCallback(async () => {
    if (!selectedTrainee) return;
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploadingNutrition(true);
    try {
      const plan = await uploadNutritionPlan(selectedTrainee.id, coachId, asset.uri, asset.name);
      setSelectedTraineeNutrition(prev => [plan, ...prev]);
    } catch (e) {
      console.warn('Nutrition plan upload error', e);
    } finally {
      setUploadingNutrition(false);
    }
  }, [selectedTrainee, coachId]);

  const handleDeleteNutrition = useCallback(async (plan: DBNutritionPlan) => {
    setSelectedTraineeNutrition(prev => prev.filter(p => p.id !== plan.id));
    try {
      await deleteNutritionPlan(plan.id, plan.storage_path);
    } catch (e) {
      console.warn('Nutrition plan delete error', e);
    }
  }, []);

  // ── Requests ──
  const handleSearchTrainees = useCallback(async (query: string) => {
    setTraineeSearchQuery(query);
    if (query.trim().length < 2) { setTraineeSearchResults([]); return; }
    setSearchingTrainees(true);
    const results = await searchUnassignedTrainees(query.trim());
    setTraineeSearchResults(results);
    setSearchingTrainees(false);
  }, []);

  const handleSendTraineeRequest = useCallback(async (trainee: DBUser) => {
    setSendingRequestTo(trainee.id);
    try {
      await sendCoachRequest(coachId, trainee.id, 'coach');
      setOutgoingRequests(prev => [
        ...prev,
        { id: '', coach_id: coachId, trainee_id: trainee.id, initiated_by: 'coach', status: 'pending', created_at: '', trainee },
      ]);
    } catch (e) {
      console.warn('sendCoachRequest error', e);
    } finally {
      setSendingRequestTo(null);
    }
  }, [coachId]);

  const handleAcceptRequest = useCallback(async (req: DBCoachRequest & { trainee: DBUser }) => {
    setRespondingId(req.id);
    try {
      await acceptCoachRequest(req.id, coachId, req.trainee_id);
      await loadData();
    } catch (e) {
      console.warn('acceptCoachRequest error', e);
    } finally {
      setRespondingId(null);
    }
  }, [coachId, loadData]);

  const handleDeclineRequest = useCallback(async (req: DBCoachRequest & { trainee: DBUser }) => {
    setRespondingId(req.id);
    try {
      await declineCoachRequest(req.id);
      setIncomingRequests(prev => prev.filter(r => r.id !== req.id));
    } catch (e) {
      console.warn('declineCoachRequest error', e);
    } finally {
      setRespondingId(null);
    }
  }, []);

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

  // Selecting a program pre-fills the workout builder from that program's exercise template.
  // The workout name is locked to the program's name — it can only be changed by editing the
  // program template itself (Programs tab), not at assignment time.
  const selectProgram = useCallback(async (program: DBProgram) => {
    setSelectedProgramId(program.id);
    setWorkoutName(program.name);
    const templateExercises = await getProgramExercises(program.id);
    setExercises(
      templateExercises.length > 0
        ? templateExercises.map((ex, i) => ({
            id: String(i) + ex.name,
            name: ex.name,
            sets: String(ex.sets),
            reps: ex.reps,
            weight: stripKg(ex.weight),
          }))
        : [buildEmptyExercise()]
    );
  }, []);

  const addSuggestedExercise = useCallback((item: { name: string; sets: string; reps: string; weight: string }) => {
    setExercises(prev => {
      const lastIdx = prev.length - 1;
      if (prev[lastIdx] && !prev[lastIdx].name.trim()) {
        return prev.map((e, i) => i === lastIdx ? { ...e, ...item, id: e.id } : e);
      }
      return [...prev, { id: String(Date.now() + Math.random()), ...item }];
    });
  }, []);

  const moveExercise = useCallback((id: string, direction: -1 | 1) => {
    setExercises(prev => {
      const index = prev.findIndex(e => e.id === id);
      const newIndex = index + direction;
      if (index === -1 || newIndex < 0 || newIndex >= prev.length) return prev;
      const arr = [...prev];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  }, []);

  const moveEditExercise = useCallback((id: string, direction: -1 | 1) => {
    setEditExercises(prev => {
      const index = prev.findIndex(e => e.id === id);
      const newIndex = index + direction;
      if (index === -1 || newIndex < 0 || newIndex >= prev.length) return prev;
      const arr = [...prev];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  }, []);

  const handleAssignNext = async () => {
    if (assignStep === 1 && selectedProgramId) {
      setAssignStep(2);
    } else if (assignStep === 2 && !saving) {
      const selProgram = programs.find(p => p.id === selectedProgramId)!;
      const exs = exercises.filter(e => e.name.trim()).map((e) => ({
        name: e.name,
        sets: parseInt(e.sets) || 3,
        reps: e.reps || '10',
        weight: withKg(e.weight),
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
        setAssignStep(3);
        if (selectedTrainee?.id === assigningTrainee!.id) {
          const wkt = await getWorkoutWithExercises(assigningTrainee!.id);
          setSelectedTraineeWorkout(wkt);
        }
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
        dbId: ex.id,
        name: ex.name,
        sets: String(ex.sets),
        reps: ex.reps,
        weight: stripKg(ex.weight),
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
    const exs = editExercises.filter(e => e.name.trim()).map((e) => ({
      id: e.dbId,
      name: e.name,
      sets: parseInt(e.sets) || 3,
      reps: e.reps || '10',
      weight: withKg(e.weight),
    }));
    setSaving(true);
    try {
      await updateWorkoutExercises(editingWorkoutId, exs);
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
  const step2Valid = exercises.some(e => e.name.trim());
  const activeCategoryItems = useMemo(
    () => library.filter(e => e.category === activeCategory),
    [library, activeCategory]
  );
  const editActiveCategoryItems = useMemo(
    () => library.filter(e => e.category === editActiveCategory),
    [library, editActiveCategory]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Trainees</Text>
        </View>

        {/* Incoming requests */}
        {incomingRequests.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>REQUESTS ({incomingRequests.length})</Text>
            {incomingRequests.map(req => (
              <View key={req.id} style={styles.requestCard}>
                <View style={styles.traineeAvatar}>
                  <Text style={styles.traineeAvatarText}>{req.trainee.avatar}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.traineeName}>{req.trainee.name}</Text>
                  <Text style={styles.traineeEmail}>Wants you as their coach</Text>
                </View>
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={styles.declineBtn}
                    onPress={() => handleDeclineRequest(req)}
                    disabled={respondingId === req.id}
                  >
                    <Text style={styles.declineBtnText}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => handleAcceptRequest(req)}
                    disabled={respondingId === req.id}
                  >
                    {respondingId === req.id ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Text style={styles.acceptBtnText}>Accept</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Find trainees */}
        <TouchableOpacity style={styles.findTraineeBtn} onPress={() => setShowFindTrainee(true)}>
          <Ionicons name="person-add-outline" size={18} color={colors.text} />
          <Text style={styles.findTraineeBtnText}>Find Trainees</Text>
        </TouchableOpacity>

        {/* Outgoing requests */}
        {outgoingRequests.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>SENT REQUESTS ({outgoingRequests.length})</Text>
            {outgoingRequests.map(req => (
              <View key={req.id ? req.id : req.trainee_id} style={styles.traineeCard}>
                <View style={styles.traineeAvatar}>
                  <Text style={styles.traineeAvatarText}>{req.trainee.avatar}</Text>
                </View>
                <View style={styles.traineeInfo}>
                  <Text style={styles.traineeName}>{req.trainee.name}</Text>
                  <Text style={styles.traineeEmail}>{req.trainee.email}</Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>Pending</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* My trainees */}
        <Text style={styles.sectionLabel}>MY TRAINEES ({trainees.length})</Text>
        {trainees.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No trainees yet</Text>
            <Text style={styles.emptySub}>Search for a trainee to send them a coaching request.</Text>
          </View>
        )}
        {trainees.map(t => (
          <TouchableOpacity
            key={t.id}
            style={styles.traineeCard}
            onPress={() => { setSelectedTrainee(t); setDetailTab('program'); }}
            activeOpacity={0.8}
          >
            <View style={[styles.traineeAvatar, styles.traineeAvatarAssigned]}>
              <Text style={[styles.traineeAvatarText, { color: colors.xpBar }]}>{t.avatar}</Text>
            </View>
            <View style={styles.traineeInfo}>
              <Text style={styles.traineeName}>{t.name}</Text>
              <Text style={styles.traineeEmail}>{t.email}</Text>
            </View>
            <View style={styles.traineeActions}>
              <View style={styles.assignedBadge}>
                <View style={styles.assignedDot} />
                <Text style={styles.assignedText}>Active</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Find Trainee Modal ── */}
      <Modal visible={showFindTrainee} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Find Trainees</Text>
              <TouchableOpacity onPress={() => { setShowFindTrainee(false); setTraineeSearchQuery(''); setTraineeSearchResults([]); }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or email..."
              placeholderTextColor={colors.textSecondary}
              value={traineeSearchQuery}
              onChangeText={handleSearchTrainees}
              autoFocus
            />
            {searchingTrainees && <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />}
            {!searchingTrainees && traineeSearchQuery.length >= 2 && traineeSearchResults.length === 0 && (
              <Text style={styles.noResults}>No unassigned trainees found</Text>
            )}
            <ScrollView>
              {traineeSearchResults.map(trainee => {
                const alreadySent = outgoingRequests.some(r => r.trainee_id === trainee.id) || sendingRequestTo === trainee.id;
                return (
                  <View key={trainee.id} style={styles.searchRow}>
                    <View style={styles.traineeAvatar}>
                      <Text style={styles.traineeAvatarText}>{trainee.avatar}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.traineeName}>{trainee.name}</Text>
                      <Text style={styles.traineeEmail}>{trainee.email}</Text>
                    </View>
                    {alreadySent ? (
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingBadgeText}>Sent</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.sendRequestBtn}
                        onPress={() => handleSendTraineeRequest(trainee)}
                      >
                        <Ionicons name="person-add" size={16} color={colors.text} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Trainee Detail Modal ── */}
      <Modal visible={!!selectedTrainee} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '92%' }]}>
            {/* Header */}
            <View style={styles.detailHeader}>
              <View style={[styles.detailAvatar, styles.detailAvatarAssigned]}>
                <Text style={styles.detailAvatarText}>{selectedTrainee?.avatar}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailName}>{selectedTrainee?.name}</Text>
                <Text style={styles.detailEmail}>{selectedTrainee?.email}</Text>
                {selectedTraineeWorkout && (
                  <Text style={styles.detailProg}>
                    {programs.find(p => p.id === selectedTraineeWorkout.workout.program_id)?.name ?? 'Program Active'}
                  </Text>
                )}
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedTrainee(null)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Status row */}
            <View style={styles.statusRow}>
              <View style={[styles.statusBadge, styles.statusBadgeActive]}>
                <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.statusText, { color: colors.success }]}>Assigned</Text>
              </View>
              {selectedTraineeWorkout ? (
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
              ) : (
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
            <View style={styles.tabRow}>
              {(['program', 'history', 'weight', 'nutrition', 'chat'] as const).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tab, detailTab === tab && styles.tabActive]}
                  onPress={() => setDetailTab(tab)}
                >
                  <Text style={[styles.tabText, detailTab === tab && styles.tabTextActive]}>
                    {tab === 'program' ? 'Program' : tab === 'history' ? 'History' : tab === 'weight' ? 'Weight' : tab === 'nutrition' ? 'Nutrition' : 'Chat'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loadingDetail ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : detailTab === 'chat' ? (
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
              >
                <ScrollView style={styles.chatMessages} showsVerticalScrollIndicator={false}>
                  {selectedTraineeMessages.length === 0 && (
                    <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>
                      No messages yet. Say hi!
                    </Text>
                  )}
                  {selectedTraineeMessages.map(msg => {
                    const isMe = msg.from_id === coachId;
                    return (
                      <View key={msg.id} style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleTrainee]}>
                        <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{msg.message}</Text>
                        <Text style={styles.bubbleTime}>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
                <View style={styles.chatInputRow}>
                  <TextInput
                    style={styles.chatInput}
                    value={chatInput}
                    onChangeText={setChatInput}
                    placeholder={`Message ${selectedTrainee?.name?.split(' ')[0] ?? 'trainee'}...`}
                    placeholderTextColor={colors.textSecondary}
                    multiline
                  />
                  <TouchableOpacity style={styles.sendBtn} onPress={handleSendToTrainee}>
                    <Ionicons name="send" size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {/* Program tab */}
                {detailTab === 'program' && (
                  <View>
                    {selectedTraineeWorkout ? (
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
                        <Text style={styles.pendingTitle}>No Program Yet</Text>
                        <Text style={styles.pendingSubtitle}>Assign a program to get this trainee started.</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* History tab */}
                {detailTab === 'history' && (
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
                {detailTab === 'weight' && (
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

                {/* Nutrition tab */}
                {detailTab === 'nutrition' && (
                  <View>
                    <Text style={styles.fieldLabel}>NUTRITION PLAN</Text>
                    <TouchableOpacity
                      style={styles.uploadPlanBtn}
                      onPress={handleUploadNutrition}
                      disabled={uploadingNutrition}
                      activeOpacity={0.85}
                    >
                      {uploadingNutrition ? (
                        <ActivityIndicator size="small" color={colors.text} />
                      ) : (
                        <Ionicons name="cloud-upload-outline" size={18} color={colors.text} />
                      )}
                      <Text style={styles.uploadPlanBtnText}>
                        {uploadingNutrition ? 'Uploading...' : 'Upload Scanned PDF'}
                      </Text>
                    </TouchableOpacity>
                    {selectedTraineeNutrition.length === 0 && (
                      <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 }}>No nutrition plans uploaded yet</Text>
                    )}
                    {selectedTraineeNutrition.map(plan => (
                      <View key={plan.id} style={styles.nutritionPlanRow}>
                        <Ionicons name="document-text" size={18} color={colors.xpBar} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.nutritionPlanName} numberOfLines={1}>{plan.file_name}</Text>
                          <Text style={styles.nutritionPlanDate}>{formatDate(plan.created_at)}</Text>
                        </View>
                        <TouchableOpacity onPress={() => handleDeleteNutrition(plan)}>
                          <Ionicons name="trash-outline" size={18} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                    ))}
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
                    No programs yet — create one first in the Programs tab.
                  </Text>
                )}
                {programs.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.programOption, selectedProgramId === p.id && styles.programOptionSelected]}
                    onPress={() => selectProgram(p)}
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
                        <Text style={styles.programOptionMeta}>{p.duration} weeks · {p.difficulty}</Text>
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
                <View style={styles.readOnlyField}>
                  <Text style={styles.readOnlyFieldText}>{workoutName}</Text>
                </View>
                <Text style={styles.readOnlyHint}>Set from the program template — edit it in the Programs tab.</Text>

                <Text style={[styles.fieldLabel, { marginTop: 20 }]}>SUGGESTED EXERCISES</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                  {categories.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.categoryChip, activeCategory === cat && styles.categoryChipActive]}
                      onPress={() => setActiveCategory(cat)}
                    >
                      <Ionicons
                        name={(CATEGORY_ICONS[cat] ?? 'ellipse') as any}
                        size={14}
                        color={activeCategory === cat ? colors.text : colors.textSecondary}
                      />
                      <Text style={[styles.categoryChipText, activeCategory === cat && styles.categoryChipTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.suggestedGrid}>
                  {activeCategoryItems.map(item => {
                    const alreadyAdded = exercises.some(e => e.name === item.name);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.suggestedChip, alreadyAdded && styles.suggestedChipAdded]}
                        onPress={() => !alreadyAdded && addSuggestedExercise({
                          name: item.name,
                          sets: sanitizeCount(String(item.default_sets), 1, 6),
                          reps: sanitizeCount(item.default_reps, 1, 30),
                          weight: stripKg(item.default_weight),
                        })}
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
                    <View style={styles.reorderCol}>
                      <TouchableOpacity disabled={i === 0} onPress={() => moveExercise(ex.id, -1)} style={styles.reorderBtn}>
                        <Ionicons name="chevron-up" size={16} color={i === 0 ? colors.border : colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity disabled={i === exercises.length - 1} onPress={() => moveExercise(ex.id, 1)} style={styles.reorderBtn}>
                        <Ionicons name="chevron-down" size={16} color={i === exercises.length - 1 ? colors.border : colors.textSecondary} />
                      </TouchableOpacity>
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
                          <Text style={styles.exMetaLabel}>SETS (1-6)</Text>
                          <TextInput
                            style={styles.exMetaInput}
                            value={ex.sets}
                            onChangeText={v => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, sets: sanitizeCount(v, 1, 6) } : e))}
                            keyboardType="number-pad"
                            placeholderTextColor={colors.textSecondary}
                          />
                        </View>
                        <View style={styles.exMetaField}>
                          <Text style={styles.exMetaLabel}>REPS (1-30)</Text>
                          <TextInput
                            style={styles.exMetaInput}
                            value={ex.reps}
                            onChangeText={v => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, reps: sanitizeCount(v, 1, 30) } : e))}
                            keyboardType="number-pad"
                            placeholderTextColor={colors.textSecondary}
                          />
                        </View>
                        <View style={styles.exMetaField}>
                          <Text style={styles.exMetaLabel}>WEIGHT (KG)</Text>
                          <TextInput
                            style={styles.exMetaInput}
                            value={ex.weight}
                            onChangeText={v => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, weight: sanitizeWeightInput(v) } : e))}
                            placeholder="0"
                            keyboardType="decimal-pad"
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
                  {assigningTrainee?.name} has been assigned {selectedProgram?.name} with their first workout ready.
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
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyFieldText}>{editWorkoutName}</Text>
              </View>
              <Text style={styles.readOnlyHint}>Set from the program template — edit it in the Programs tab.</Text>

              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>ADD EXERCISES</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryChip, editActiveCategory === cat && styles.categoryChipActive]}
                    onPress={() => setEditActiveCategory(cat)}
                  >
                    <Ionicons
                      name={(CATEGORY_ICONS[cat] ?? 'ellipse') as any}
                      size={14}
                      color={editActiveCategory === cat ? colors.text : colors.textSecondary}
                    />
                    <Text style={[styles.categoryChipText, editActiveCategory === cat && styles.categoryChipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.suggestedGrid}>
                {editActiveCategoryItems.map(item => {
                  const alreadyAdded = editExercises.some(e => e.name === item.name);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.suggestedChip, alreadyAdded && styles.suggestedChipAdded]}
                      onPress={() => !alreadyAdded && addEditSuggestedExercise({
                        name: item.name,
                        sets: sanitizeCount(String(item.default_sets), 1, 6),
                        reps: sanitizeCount(item.default_reps, 1, 30),
                        weight: stripKg(item.default_weight),
                      })}
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
                  <View style={styles.reorderCol}>
                    <TouchableOpacity disabled={i === 0} onPress={() => moveEditExercise(ex.id, -1)} style={styles.reorderBtn}>
                      <Ionicons name="chevron-up" size={16} color={i === 0 ? colors.border : colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity disabled={i === editExercises.length - 1} onPress={() => moveEditExercise(ex.id, 1)} style={styles.reorderBtn}>
                      <Ionicons name="chevron-down" size={16} color={i === editExercises.length - 1 ? colors.border : colors.textSecondary} />
                    </TouchableOpacity>
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
                        <Text style={styles.exMetaLabel}>SETS (1-6)</Text>
                        <TextInput
                          style={styles.exMetaInput}
                          value={ex.sets}
                          onChangeText={v => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, sets: sanitizeCount(v, 1, 6) } : e))}
                          keyboardType="number-pad"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                      <View style={styles.exMetaField}>
                        <Text style={styles.exMetaLabel}>REPS (1-30)</Text>
                        <TextInput
                          style={styles.exMetaInput}
                          value={ex.reps}
                          onChangeText={v => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, reps: sanitizeCount(v, 1, 30) } : e))}
                          keyboardType="number-pad"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                      <View style={styles.exMetaField}>
                        <Text style={styles.exMetaLabel}>WEIGHT (KG)</Text>
                        <TextInput
                          style={styles.exMetaInput}
                          value={ex.weight}
                          onChangeText={v => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, weight: sanitizeWeightInput(v) } : e))}
                          placeholder="0"
                          keyboardType="decimal-pad"
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

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1.5, marginBottom: 12, marginTop: 8,
  },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },

  // Requests
  requestCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: colors.xpBar + '44',
  },
  requestActions: { flexDirection: 'row', gap: 8 },
  declineBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border,
  },
  declineBtnText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  acceptBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: colors.xpBar,
  },
  acceptBtnText: { fontSize: 12, fontWeight: '700', color: '#000' },

  findTraineeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, marginBottom: 20,
  },
  findTraineeBtnText: { fontSize: 15, fontWeight: '700', color: colors.text },

  pendingBadge: {
    backgroundColor: colors.textSecondary + '22',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  pendingBadgeText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },

  // Trainee cards
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
  traineeActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  assignedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.success + '22',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  assignedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  assignedText: { fontSize: 11, color: colors.success, fontWeight: '600' },

  // Search modal
  overlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '80%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  searchInput: {
    backgroundColor: colors.secondary,
    borderRadius: 12, padding: 14,
    color: colors.text, fontSize: 15,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 8,
  },
  noResults: { color: colors.textSecondary, textAlign: 'center', marginTop: 16 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sendRequestBtn: {
    backgroundColor: colors.primary,
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

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
  reorderCol: { justifyContent: 'center', marginTop: 8 },
  reorderBtn: { padding: 2 },
  readOnlyField: {
    backgroundColor: colors.secondary, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.border, marginBottom: 4,
  },
  readOnlyFieldText: { fontSize: 15, color: colors.text, fontWeight: '600' },
  readOnlyHint: { fontSize: 11, color: colors.textSecondary, marginBottom: 4 },
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

  // Chat tab
  chatMessages: { flex: 1, marginBottom: 12 },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
  },
  bubbleTrainee: {
    backgroundColor: colors.secondary,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: colors.xpBar + '33',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bubbleTextMe: { color: colors.xpBar },
  bubbleTime: { fontSize: 10, color: colors.textSecondary, marginTop: 4, textAlign: 'right' },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 80,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.xpBar,
    alignItems: 'center',
    justifyContent: 'center',
  },

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

  // Nutrition tab
  uploadPlanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, marginBottom: 16,
  },
  uploadPlanBtnText: { fontSize: 14, fontWeight: '700', color: colors.text },
  nutritionPlanRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  nutritionPlanName: { fontSize: 14, fontWeight: '600', color: colors.text },
  nutritionPlanDate: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

  // Pending block
  pendingBlock: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  pendingTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  pendingSubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
});
