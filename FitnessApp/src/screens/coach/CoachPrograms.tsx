import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text, TextInput } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { getPrograms, createProgram, updateProgram, deleteProgram, getProgramExercises, updateProgramExercises, getExerciseLibrary, createLibraryExercise } from '../../lib/db';
import { DBProgram, DBLibraryExercise } from '../../lib/supabase';
import ExerciseLibraryManager from './ExerciseLibraryManager';
import { sanitizeCount, sanitizeWeightInput, sanitizeTimeInput, stripKg, withKg } from '../../lib/exerciseInput';

interface Props {
  coachId: string;
}

interface ExerciseEntry {
  id: string;
  dbId?: string; // real DB row id when this entry was loaded from an existing program_exercises row
  name: string;
  sets: string;
  reps: string;
  weight: string;
  time: string; // minutes, default '0'
  restSeconds: string; // rest between sets, in seconds; '0' = no rest timer
  laterality: 'single_arm' | 'single_leg' | null; // null = both sides together
}

function buildEmptyExercise(): ExerciseEntry {
  return { id: String(Date.now() + Math.random()), name: '', sets: '3', reps: '10', weight: '', time: '0', restSeconds: '0', laterality: null };
}

const LATERALITY_OPTIONS: { value: 'single_arm' | 'single_leg' | null; label: string }[] = [
  { value: null, label: 'Both' },
  { value: 'single_arm', label: 'Single Arm' },
  { value: 'single_leg', label: 'Single Leg' },
];

const CATEGORY_ICONS: Record<string, string> = {
  Push: 'arrow-up-circle',
  Pull: 'arrow-down-circle',
  Legs: 'fitness',
  Core: 'body',
  Cardio: 'heart',
  Stretch: 'accessibility-outline',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function exercisesPayload(exercises: ExerciseEntry[]) {
  return exercises.filter(e => e.name.trim()).map((e) => ({
    id: e.dbId,
    name: e.name,
    sets: parseInt(e.sets) || 3,
    reps: e.reps || '10',
    weight: withKg(e.weight),
    time: e.time.trim() || '0',
    rest_seconds: parseInt(e.restSeconds) || 0,
    laterality: e.laterality,
  }));
}

export default function CoachPrograms({ coachId }: Props) {
  const [programs, setPrograms] = useState<DBProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Add Program modal ──
  const [showAddProgram, setShowAddProgram] = useState(false);
  const [newProgName, setNewProgName] = useState('');
  const [newProgDesc, setNewProgDesc] = useState('');
  const [newProgDuration, setNewProgDuration] = useState('');
  const [newProgDiff, setNewProgDiff] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [exercises, setExercises] = useState<ExerciseEntry[]>([buildEmptyExercise()]);
  const [activeCategory, setActiveCategory] = useState('Push');

  // ── Edit Program modal ──
  const [showEditProgram, setShowEditProgram] = useState(false);
  const [editingProgram, setEditingProgram] = useState<DBProgram | null>(null);
  const [editProgName, setEditProgName] = useState('');
  const [editProgDesc, setEditProgDesc] = useState('');
  const [editProgDuration, setEditProgDuration] = useState('');
  const [editProgDiff, setEditProgDiff] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [editExercises, setEditExercises] = useState<ExerciseEntry[]>([]);
  const [editActiveCategory, setEditActiveCategory] = useState('Push');
  const [loadingEditExercises, setLoadingEditExercises] = useState(false);

  // ── Shared exercise library ──
  const [library, setLibrary] = useState<DBLibraryExercise[]>([]);
  const [showLibraryManager, setShowLibraryManager] = useState(false);

  // Two separate native <Modal>s can't both be visible at once — iOS won't
  // reliably show/register touches on the second one stacked over the first
  // (Android tolerates it fine). "Manage Library" and the exercise name
  // picker both open a second Modal from inside the still-open Add/Edit
  // Program modal, so that outer modal is closed first and reopened once the
  // inner one closes — this just remembers which one to reopen. None of the
  // Add/Edit form state lives on the modal's visibility flag, so closing and
  // reopening it doesn't lose anything the coach had already typed.
  const [reopenAfterModal, setReopenAfterModal] = useState<'add' | 'edit' | null>(null);
  const closeOuterForInner = useCallback((which: 'add' | 'edit') => {
    setReopenAfterModal(which);
    if (which === 'add') setShowAddProgram(false);
    else setShowEditProgram(false);
  }, []);
  const reopenOuterAfterInner = useCallback(() => {
    if (reopenAfterModal === 'add') setShowAddProgram(true);
    else if (reopenAfterModal === 'edit') setShowEditProgram(true);
    setReopenAfterModal(null);
  }, [reopenAfterModal]);

  const loadPrograms = useCallback(async () => {
    setLoadError(false);
    try {
      const progs = await getPrograms(coachId);
      setPrograms(progs);
    } catch (e) {
      console.warn('getPrograms error', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  const loadLibrary = useCallback(async () => {
    setLibrary(await getExerciseLibrary());
  }, []);

  const handleDeleteProgram = useCallback((program: DBProgram) => {
    Alert.alert(
      'Delete Program',
      `Delete "${program.name}"? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(program.id);
            try {
              await deleteProgram(program.id);
              setPrograms(prev => prev.filter(p => p.id !== program.id));
            } catch (e: any) {
              Alert.alert('Can\'t Delete Program', e?.message ?? 'Something went wrong — try again.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  }, []);

  useEffect(() => {
    loadPrograms();
    loadLibrary();
  }, [loadPrograms, loadLibrary]);

  const categories = useMemo(() => {
    // 'Stretch' was the old broad category before the ~650-exercise catalog
    // expansion (scripts/exercise_library_full_catalog.sql) replaced it with
    // the more specific 'Stretching, Mobility and Recovery' — no row ever
    // used literally 'Stretch', so keeping it here just showed an always-
    // empty category. Drop it; the real one comes through via `library`.
    const known = ['Push', 'Pull', 'Legs', 'Core', 'Cardio'];
    return Array.from(new Set([...known, ...library.map(e => e.category)]));
  }, [library]);

  // ── Exercise name picker (dropdown sourced from the shared library, with inline "add new") ──
  const [showNamePicker, setShowNamePicker] = useState(false);
  const [namePickerQuery, setNamePickerQuery] = useState('');
  const [savingNewName, setSavingNewName] = useState(false);
  const namePickerOnSelectRef = useRef<((name: string) => void) | null>(null);
  // Optional — only the "add a suggested exercise" call sites pass one, so
  // their picker can show/disable already-added items; the rename-an-
  // existing-row call sites don't, since "already added" isn't a
  // meaningful concept there.
  const namePickerIsAddedRef = useRef<((name: string) => boolean) | null>(null);
  const namePickerInputRef = useRef<TextInput>(null);
  const [namePickerCategory, setNamePickerCategory] = useState('Push');
  // Which outer flow opened the picker — lets the in-modal category chips
  // (below) sync back to the right "last selected category" state
  // (activeCategory for Add, editActiveCategory for Edit) so the picker
  // field's own label stays in sync after the coach switches category from
  // inside the modal.
  const namePickerWhichRef = useRef<'add' | 'edit'>('add');
  // Replaces the old horizontal chip-scroll for category selection — with
  // up to 20 categories, scrolling through chips was worse than just
  // picking from a list. Collapsed by default; tapping the category field
  // expands this inline list (no nested Modal — see Robustness Pitfalls #7
  // in CLAUDE.md about two simultaneous Modals on iOS).
  const [showNamePickerCategoryList, setShowNamePickerCategoryList] = useState(false);

  const uniqueLibraryNames = useMemo(
    () => Array.from(new Set(
      library.filter(e => e.category === namePickerCategory).map(e => e.name)
    )).sort((a, b) => a.localeCompare(b)),
    [library, namePickerCategory]
  );

  const filteredLibraryNames = useMemo(() => {
    const q = namePickerQuery.trim().toLowerCase();
    if (!q) return uniqueLibraryNames;
    return uniqueLibraryNames.filter(n => n.toLowerCase().includes(q));
  }, [uniqueLibraryNames, namePickerQuery]);

  const namePickerExactMatch = uniqueLibraryNames.some(
    n => n.toLowerCase() === namePickerQuery.trim().toLowerCase()
  );

  const openNamePicker = useCallback((
    onSelect: (name: string) => void,
    category: string,
    which: 'add' | 'edit',
    isAdded?: (name: string) => boolean
  ) => {
    closeOuterForInner(which);
    namePickerOnSelectRef.current = onSelect;
    namePickerIsAddedRef.current = isAdded ?? null;
    namePickerWhichRef.current = which;
    setNamePickerCategory(category);
    setNamePickerQuery('');
    setShowNamePicker(true);
  }, [closeOuterForInner]);

  const closeNamePicker = useCallback(() => {
    setShowNamePicker(false);
    setShowNamePickerCategoryList(false);
    reopenOuterAfterInner();
  }, [reopenOuterAfterInner]);

  // Switching category from inside the picker modal (replaces the old
  // always-visible horizontal chip row on the main screen) — also syncs
  // the outer "last selected category" state so the picker field's own
  // label reflects it next time it's shown, and the next open of this
  // same flow defaults back to it.
  const handleNamePickerCategoryChange = useCallback((cat: string) => {
    setNamePickerCategory(cat);
    setNamePickerQuery('');
    setShowNamePickerCategoryList(false);
    if (namePickerWhichRef.current === 'add') setActiveCategory(cat);
    else setEditActiveCategory(cat);
  }, []);

  const handlePickName = useCallback((name: string) => {
    if (namePickerIsAddedRef.current?.(name)) return;
    namePickerOnSelectRef.current?.(name);
    closeNamePicker();
  }, [closeNamePicker]);

  const handleAddNewName = useCallback(async () => {
    const name = namePickerQuery.trim();
    if (!name || savingNewName) return;
    setSavingNewName(true);
    try {
      await createLibraryExercise({
        name,
        category: namePickerCategory,
        default_sets: 3,
        default_reps: '10',
        default_time: '0',
        created_by: coachId,
      });
      await loadLibrary();
      namePickerOnSelectRef.current?.(name);
      closeNamePicker();
    } catch (e) {
      console.warn('createLibraryExercise error', e);
    } finally {
      setSavingNewName(false);
    }
  }, [namePickerQuery, savingNewName, coachId, loadLibrary, namePickerCategory, closeNamePicker]);

  // ── Add Program ──
  const openAddModal = () => {
    setNewProgName('');
    setNewProgDesc('');
    setNewProgDuration('');
    setNewProgDiff('Intermediate');
    setExercises([buildEmptyExercise()]);
    setActiveCategory('Push');
    setShowAddProgram(true);
  };

  const addSuggestedExercise = useCallback((item: { name: string; sets: string; reps: string; weight: string; time: string }) => {
    setExercises(prev => {
      const lastIdx = prev.length - 1;
      if (prev[lastIdx] && !prev[lastIdx].name.trim()) {
        return prev.map((e, i) => i === lastIdx ? { ...e, ...item, id: e.id } : e);
      }
      return [...prev, { id: String(Date.now() + Math.random()), restSeconds: '0', laterality: null, ...item }];
    });
  }, []);

  const saveNewProgram = async () => {
    if (!newProgName.trim() || saving) return;
    setSaving(true);
    try {
      await createProgram({
        name: newProgName.trim(),
        description: newProgDesc.trim() || 'Custom program',
        duration: newProgDuration.trim() || '8',
        difficulty: newProgDiff,
        coach_id: coachId,
      }, exercisesPayload(exercises));
      await loadPrograms();
      setShowAddProgram(false);
    } catch (e) {
      console.warn('createProgram error', e);
    } finally {
      setSaving(false);
    }
  };

  // ── Edit Program ──
  const openEditProgram = async (program: DBProgram) => {
    setEditingProgram(program);
    setEditProgName(program.name);
    setEditProgDesc(program.description);
    setEditProgDuration(program.duration);
    setEditProgDiff(program.difficulty);
    setEditActiveCategory('Push');
    setShowEditProgram(true);
    setLoadingEditExercises(true);
    const progExercises = await getProgramExercises(program.id);
    setEditExercises(
      progExercises.length > 0
        ? progExercises.map((ex, i) => ({
            id: String(i) + ex.name,
            dbId: ex.exercise_id,
            name: ex.name,
            sets: String(ex.sets),
            reps: ex.reps,
            weight: stripKg(ex.weight),
            time: sanitizeTimeInput(ex.time ?? '0'),
            restSeconds: String(ex.rest_seconds ?? '0'),
            laterality: ex.laterality ?? null,
          }))
        : [buildEmptyExercise()]
    );
    setLoadingEditExercises(false);
  };

  const addEditSuggestedExercise = useCallback((item: { name: string; sets: string; reps: string; weight: string; time: string }) => {
    setEditExercises(prev => {
      const lastIdx = prev.length - 1;
      if (prev[lastIdx] && !prev[lastIdx].name.trim()) {
        return prev.map((e, i) => i === lastIdx ? { ...e, ...item, id: e.id } : e);
      }
      return [...prev, { id: String(Date.now() + Math.random()), restSeconds: '0', laterality: null, ...item }];
    });
  }, []);

  const saveEditProgram = async () => {
    if (!editingProgram || !editProgName.trim() || saving) return;
    setSaving(true);
    try {
      const updates = {
        name: editProgName.trim(),
        description: editProgDesc.trim() || 'Custom program',
        duration: editProgDuration.trim() || '8',
        difficulty: editProgDiff,
      };
      await updateProgram(editingProgram.id, updates);
      await updateProgramExercises(editingProgram.id, exercisesPayload(editExercises));
      setPrograms(prev => prev.map(p => p.id === editingProgram.id ? { ...p, ...updates } : p));
      setShowEditProgram(false);
      setEditingProgram(null);
    } catch (e) {
      console.warn('saveEditProgram error', e);
    } finally {
      setSaving(false);
    }
  };

  const activeCategoryItems = useMemo(
    () => library.filter(e => e.category === activeCategory),
    [library, activeCategory]
  );
  const editActiveCategoryItems = useMemo(
    () => library.filter(e => e.category === editActiveCategory),
    [library, editActiveCategory]
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Programs</Text>
        </View>

        {/* Second access point to the same exercise library manager used inside
            the program editor — lets a coach curate it without opening a program. */}
        <TouchableOpacity style={styles.manageLibraryTopBtn} onPress={() => setShowLibraryManager(true)} activeOpacity={0.85}>
          <Ionicons name="library-outline" size={18} color={colors.xpBar} />
          <Text style={styles.manageLibraryTopBtnText}>Manage Exercise Library</Text>
        </TouchableOpacity>

        {/* Add Program button — top, prominent. Always reachable, even if the list below is still loading or failed. */}
        <TouchableOpacity style={styles.addProgramBtn} onPress={openAddModal} activeOpacity={0.85}>
          <Ionicons name="add-circle" size={20} color={colors.text} />
          <Text style={styles.addProgramBtnText}>Add Program</Text>
        </TouchableOpacity>

        {/* Programs list */}
        {loading && (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        {!loading && loadError && (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyText}>Couldn't load programs</Text>
            <Text style={styles.emptySub}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); loadPrograms(); }}>
              <Ionicons name="refresh" size={16} color={colors.text} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {!loading && !loadError && programs.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No programs yet</Text>
            <Text style={styles.emptySub}>Tap "Add Program" above to create your first training program.</Text>
          </View>
        )}
        {!loading && !loadError && programs.map((program) => (
          <TouchableOpacity key={program.id} style={styles.programCard} activeOpacity={0.8} onPress={() => openEditProgram(program)}>
            <View style={styles.programHeader}>
              <View style={styles.programIcon}>
                <Ionicons name="barbell" size={24} color={colors.primary} />
              </View>
              <View style={styles.programInfo}>
                <Text style={styles.programName}>{program.name}</Text>
                <View style={styles.badgeRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{program.duration} weeks</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: colors.accent + '66' }]}>
                    <Text style={[styles.badgeText, { color: colors.xpBar }]}>{program.difficulty}</Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.programDesc}>{program.description}</Text>
            <View style={styles.programFooter}>
              <Text style={styles.createdText}>Created {formatDate(program.created_at)}</Text>
              <TouchableOpacity
                style={styles.deleteProgramBtn}
                onPress={() => handleDeleteProgram(program)}
                disabled={deletingId === program.id}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {deletingId === program.id ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Add Program Modal ── */}
      <Modal
        visible={showAddProgram}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddProgram(false)}
      >
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
              <Text style={styles.fieldLabel}>DURATION (WEEKS)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 8"
                placeholderTextColor={colors.textSecondary}
                value={newProgDuration}
                onChangeText={v => setNewProgDuration(sanitizeCount(v, 1, 20))}
                keyboardType="number-pad"
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

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={styles.fieldLabel}>SUGGESTED EXERCISES</Text>
                <TouchableOpacity onPress={() => { closeOuterForInner('add'); setShowLibraryManager(true); }}>
                  <Text style={styles.manageLibraryText}>Manage Library</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.suggestedPickerField}
                onPress={() => openNamePicker(
                  name => {
                    const item = library.find(e => e.category === activeCategory && e.name === name);
                    if (!item) return;
                    addSuggestedExercise({
                      name: item.name,
                      sets: sanitizeCount(String(item.default_sets), 1, 6),
                      reps: sanitizeCount(item.default_reps, 1, 30),
                      weight: stripKg(item.default_weight),
                      time: sanitizeTimeInput(item.default_time ?? '0'),
                    });
                  },
                  activeCategory,
                  'add',
                  name => exercises.some(e => e.name === name)
                )}
              >
                <Ionicons name="search" size={16} color={colors.textSecondary} />
                <Text style={styles.suggestedPickerFieldText} numberOfLines={1}>
                  {activeCategoryItems.length > 0
                    ? `Choose a ${activeCategory} exercise (${activeCategoryItems.length})…`
                    : `No ${activeCategory} exercises in the library yet`}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
              </TouchableOpacity>

              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>EXERCISES</Text>
              {exercises.map((ex, i) => (
                <View key={ex.id} style={styles.exerciseRow}>
                  <View style={styles.exNumBadge}>
                    <Text style={styles.exNumText}>{i + 1}</Text>
                  </View>
                  <View style={styles.exFields}>
                    <TouchableOpacity
                      style={[styles.textInput, styles.namePickerField, { marginBottom: 8 }]}
                      onPress={() => openNamePicker(
                        name => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, name } : e)),
                        activeCategory,
                        'add'
                      )}
                      activeOpacity={0.7}
                    >
                      <Text style={ex.name ? styles.namePickerText : styles.namePickerPlaceholder}>
                        {ex.name || 'Select exercise name'}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <View style={styles.exMetaRow}>
                      <View style={styles.exMetaField}>
                        <Text style={styles.exMetaLabel} numberOfLines={1}>SETS (1-6)</Text>
                        <TextInput
                          style={styles.exMetaInput}
                          value={ex.sets}
                          onChangeText={v => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, sets: sanitizeCount(v, 1, 6) } : e))}
                          keyboardType="number-pad"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                      <View style={styles.exMetaField}>
                        <Text style={styles.exMetaLabel} numberOfLines={1}>REPS (1-30)</Text>
                        <TextInput
                          style={styles.exMetaInput}
                          value={ex.reps}
                          onChangeText={v => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, reps: sanitizeCount(v, 1, 30) } : e))}
                          keyboardType="number-pad"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                      <View style={styles.exMetaField}>
                        <Text style={styles.exMetaLabel} numberOfLines={1}>WEIGHT (KG)</Text>
                        <TextInput
                          style={styles.exMetaInput}
                          value={ex.weight}
                          onChangeText={v => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, weight: sanitizeWeightInput(v) } : e))}
                          placeholder="0"
                          keyboardType="decimal-pad"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                      <View style={styles.exMetaField}>
                        <Text style={styles.exMetaLabel} numberOfLines={1}>TIME (S/M)</Text>
                        <TextInput
                          style={styles.exMetaInput}
                          value={ex.time}
                          onChangeText={v => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, time: sanitizeTimeInput(v) } : e))}
                          placeholder="e.g. 30s"
                          keyboardType="default"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                      <View style={styles.exMetaField}>
                        <Text style={styles.exMetaLabel} numberOfLines={1}>REST (SEC)</Text>
                        <TextInput
                          style={styles.exMetaInput}
                          value={ex.restSeconds}
                          onChangeText={v => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, restSeconds: sanitizeCount(v, 0, 600) } : e))}
                          placeholder="0"
                          keyboardType="number-pad"
                          placeholderTextColor={colors.textSecondary}
                        />
                      </View>
                      {exercises.length > 1 && (
                        <TouchableOpacity
                          onPress={() => setExercises(prev => prev.filter(e => e.id !== ex.id))}
                          style={styles.removeBtn}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.lateralityRow}>
                      {LATERALITY_OPTIONS.map(opt => (
                        <TouchableOpacity
                          key={opt.label}
                          style={[styles.lateralityChip, ex.laterality === opt.value && styles.lateralityChipActive]}
                          onPress={() => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, laterality: opt.value } : e))}
                        >
                          <Text style={[styles.lateralityChipText, ex.laterality === opt.value && styles.lateralityChipTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit Program Modal ── */}
      <Modal
        visible={showEditProgram}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditProgram(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Program</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setShowEditProgram(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {loadingEditExercises ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.fieldLabel}>PROGRAM NAME</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Strength Builder Pro"
                  placeholderTextColor={colors.textSecondary}
                  value={editProgName}
                  onChangeText={setEditProgName}
                />
                <Text style={styles.fieldLabel}>DESCRIPTION</Text>
                <TextInput
                  style={[styles.textInput, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Describe the program..."
                  placeholderTextColor={colors.textSecondary}
                  value={editProgDesc}
                  onChangeText={setEditProgDesc}
                  multiline
                />
                <Text style={styles.fieldLabel}>DURATION (WEEKS)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 8"
                  placeholderTextColor={colors.textSecondary}
                  value={editProgDuration}
                  onChangeText={v => setEditProgDuration(sanitizeCount(v, 1, 20))}
                  keyboardType="number-pad"
                />
                <Text style={styles.fieldLabel}>DIFFICULTY</Text>
                <View style={styles.diffRow}>
                  {(['Beginner', 'Intermediate', 'Advanced'] as const).map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.diffChip, editProgDiff === d && styles.diffChipActive]}
                      onPress={() => setEditProgDiff(d)}
                    >
                      <Text style={[styles.diffChipText, editProgDiff === d && styles.diffChipTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text style={styles.fieldLabel}>SUGGESTED EXERCISES</Text>
                  <TouchableOpacity onPress={() => { closeOuterForInner('edit'); setShowLibraryManager(true); }}>
                    <Text style={styles.manageLibraryText}>Manage Library</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.suggestedPickerField}
                  onPress={() => openNamePicker(
                    name => {
                      const item = library.find(e => e.category === editActiveCategory && e.name === name);
                      if (!item) return;
                      addEditSuggestedExercise({
                        name: item.name,
                        sets: sanitizeCount(String(item.default_sets), 1, 6),
                        reps: sanitizeCount(item.default_reps, 1, 30),
                        weight: stripKg(item.default_weight),
                        time: sanitizeTimeInput(item.default_time ?? '0'),
                      });
                    },
                    editActiveCategory,
                    'edit',
                    name => editExercises.some(e => e.name === name)
                  )}
                >
                  <Ionicons name="search" size={16} color={colors.textSecondary} />
                  <Text style={styles.suggestedPickerFieldText} numberOfLines={1}>
                    {editActiveCategoryItems.length > 0
                      ? `Choose a ${editActiveCategory} exercise (${editActiveCategoryItems.length})…`
                      : `No ${editActiveCategory} exercises in the library yet`}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                </TouchableOpacity>

                <Text style={[styles.fieldLabel, { marginTop: 20 }]}>
                  EXERCISES ({editExercises.filter(e => e.name.trim()).length})
                </Text>
                {editExercises.map((ex, i) => (
                  <View key={ex.id} style={styles.exerciseRow}>
                    <View style={styles.exNumBadge}>
                      <Text style={styles.exNumText}>{i + 1}</Text>
                    </View>
                    <View style={styles.exFields}>
                      <TouchableOpacity
                        style={[styles.textInput, styles.namePickerField, { marginBottom: 8 }]}
                        onPress={() => openNamePicker(
                          name => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, name } : e)),
                          editActiveCategory,
                          'edit'
                        )}
                        activeOpacity={0.7}
                      >
                        <Text style={ex.name ? styles.namePickerText : styles.namePickerPlaceholder}>
                          {ex.name || 'Select exercise name'}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                      <View style={styles.exMetaRow}>
                        <View style={styles.exMetaField}>
                          <Text style={styles.exMetaLabel} numberOfLines={1}>SETS (1-6)</Text>
                          <TextInput
                            style={styles.exMetaInput}
                            value={ex.sets}
                            onChangeText={v => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, sets: sanitizeCount(v, 1, 6) } : e))}
                            keyboardType="number-pad"
                            placeholderTextColor={colors.textSecondary}
                          />
                        </View>
                        <View style={styles.exMetaField}>
                          <Text style={styles.exMetaLabel} numberOfLines={1}>REPS (1-30)</Text>
                          <TextInput
                            style={styles.exMetaInput}
                            value={ex.reps}
                            onChangeText={v => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, reps: sanitizeCount(v, 1, 30) } : e))}
                            keyboardType="number-pad"
                            placeholderTextColor={colors.textSecondary}
                          />
                        </View>
                        <View style={styles.exMetaField}>
                          <Text style={styles.exMetaLabel} numberOfLines={1}>WEIGHT (KG)</Text>
                          <TextInput
                            style={styles.exMetaInput}
                            value={ex.weight}
                            onChangeText={v => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, weight: sanitizeWeightInput(v) } : e))}
                            placeholder="0"
                            keyboardType="decimal-pad"
                            placeholderTextColor={colors.textSecondary}
                          />
                        </View>
                        <View style={styles.exMetaField}>
                          <Text style={styles.exMetaLabel} numberOfLines={1}>TIME (S/M)</Text>
                          <TextInput
                            style={styles.exMetaInput}
                            value={ex.time}
                            onChangeText={v => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, time: sanitizeTimeInput(v) } : e))}
                            placeholder="e.g. 30s"
                            keyboardType="default"
                            placeholderTextColor={colors.textSecondary}
                          />
                        </View>
                        <View style={styles.exMetaField}>
                          <Text style={styles.exMetaLabel} numberOfLines={1}>REST (SEC)</Text>
                          <TextInput
                            style={styles.exMetaInput}
                            value={ex.restSeconds}
                            onChangeText={v => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, restSeconds: sanitizeCount(v, 0, 600) } : e))}
                            placeholder="0"
                            keyboardType="number-pad"
                            placeholderTextColor={colors.textSecondary}
                          />
                        </View>
                        <TouchableOpacity
                          onPress={() => setEditExercises(prev => prev.filter(e => e.id !== ex.id))}
                          style={styles.removeBtn}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.lateralityRow}>
                        {LATERALITY_OPTIONS.map(opt => (
                          <TouchableOpacity
                            key={opt.label}
                            style={[styles.lateralityChip, ex.laterality === opt.value && styles.lateralityChipActive]}
                            onPress={() => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, laterality: opt.value } : e))}
                          >
                            <Text style={[styles.lateralityChipText, ex.laterality === opt.value && styles.lateralityChipTextActive]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
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

                <View style={styles.modalFooter}>
                  <TouchableOpacity style={styles.backBtn} onPress={() => setShowEditProgram(false)}>
                    <Text style={styles.backBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.nextBtn, styles.nextBtnInFooter, (!editProgName.trim() || saving) && styles.nextBtnDisabled]}
                    onPress={saveEditProgram}
                    disabled={!editProgName.trim() || saving}
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
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ExerciseLibraryManager
        visible={showLibraryManager}
        coachId={coachId}
        onClose={() => { setShowLibraryManager(false); reopenOuterAfterInner(); }}
        onChange={loadLibrary}
      />

      {/* ── Exercise Name Picker ── */}
      <Modal
        visible={showNamePicker}
        transparent
        animationType="slide"
        onRequestClose={closeNamePicker}
        onShow={() => namePickerInputRef.current?.focus()}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.namePickerOverlay}>
            <View style={styles.namePickerSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Exercise</Text>
                <TouchableOpacity style={styles.closeBtn} onPress={closeNamePicker}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {/* Category now lives inside the picker — replaces the old
                  always-visible horizontal chip row on the main screen,
                  which didn't scale once categories got this many. A
                  dropdown (tap to expand an inline list, not a second
                  nested Modal — see Robustness Pitfalls #7) reads better
                  than a horizontal chip scroll once there are ~20 of them.
                  Picking one here filters the list below, same as search does. */}
              <TouchableOpacity
                style={styles.categoryDropdownField}
                onPress={() => setShowNamePickerCategoryList(v => !v)}
              >
                <Ionicons
                  name={(CATEGORY_ICONS[namePickerCategory] ?? 'ellipse') as any}
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={styles.categoryDropdownFieldText}>{namePickerCategory}</Text>
                <Ionicons
                  name={showNamePickerCategoryList ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
              {showNamePickerCategoryList && (
                <ScrollView style={styles.categoryDropdownList} keyboardShouldPersistTaps="handled">
                  {categories.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.categoryDropdownRow, namePickerCategory === cat && styles.categoryDropdownRowActive]}
                      onPress={() => handleNamePickerCategoryChange(cat)}
                    >
                      <Ionicons
                        name={(CATEGORY_ICONS[cat] ?? 'ellipse') as any}
                        size={15}
                        color={namePickerCategory === cat ? colors.xpBar : colors.textSecondary}
                      />
                      <Text style={[styles.categoryDropdownRowText, namePickerCategory === cat && styles.categoryDropdownRowTextActive]}>
                        {cat}
                      </Text>
                      {namePickerCategory === cat && <Ionicons name="checkmark" size={16} color={colors.xpBar} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TextInput
                ref={namePickerInputRef}
                style={styles.textInput}
                placeholder={`Search ${namePickerCategory} exercises, or type a new name...`}
                placeholderTextColor={colors.textSecondary}
                value={namePickerQuery}
                onChangeText={setNamePickerQuery}
              />
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 340 }}>
                {filteredLibraryNames.map(name => {
                  const alreadyAdded = namePickerIsAddedRef.current?.(name) ?? false;
                  return (
                    <TouchableOpacity
                      key={name}
                      style={styles.namePickerRow}
                      onPress={() => handlePickName(name)}
                      disabled={alreadyAdded}
                      activeOpacity={alreadyAdded ? 1 : 0.7}
                    >
                      <Ionicons
                        name={alreadyAdded ? 'checkmark-circle' : 'barbell-outline'}
                        size={16}
                        color={alreadyAdded ? colors.xpBar : colors.textSecondary}
                      />
                      <Text style={[styles.namePickerRowText, alreadyAdded && { color: colors.xpBar }]}>{name}</Text>
                    </TouchableOpacity>
                  );
                })}
                {namePickerQuery.trim().length > 0 && !namePickerExactMatch && (
                  <TouchableOpacity
                    style={[styles.namePickerRow, styles.namePickerAddRow]}
                    onPress={handleAddNewName}
                    disabled={savingNewName}
                  >
                    {savingNewName ? (
                      <ActivityIndicator size="small" color={colors.xpBar} />
                    ) : (
                      <Ionicons name="add-circle-outline" size={16} color={colors.xpBar} />
                    )}
                    <Text style={styles.namePickerAddText}>Add "{namePickerQuery.trim()}" as a new exercise</Text>
                  </TouchableOpacity>
                )}
                {filteredLibraryNames.length === 0 && namePickerQuery.trim().length === 0 && (
                  <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 }}>
                    No {namePickerCategory} exercises in the library yet — type a name above to add one.
                  </Text>
                )}
              </ScrollView>
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

  addProgramBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FF8C00', borderRadius: 12, paddingVertical: 14, marginBottom: 20,
  },
  addProgramBtnText: { fontSize: 15, fontWeight: '700', color: colors.text },
  manageLibraryTopBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.card, borderRadius: 12, paddingVertical: 12, marginBottom: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  manageLibraryTopBtnText: { fontSize: 14, fontWeight: '700', color: colors.xpBar },

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
  createdText: { fontSize: 12, color: colors.textSecondary },
  deleteProgramBtn: { padding: 4 },

  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.secondary, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 10, marginTop: 8, borderWidth: 1, borderColor: colors.border,
  },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: colors.text },

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
  modalTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center',
  },
  modalFooter: { flexDirection: 'row', gap: 10, paddingTop: 16, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border },

  // Inputs
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1.5, marginBottom: 8 },
  manageLibraryText: { fontSize: 11, fontWeight: '700', color: colors.xpBar, letterSpacing: 0.5 },
  textInput: {
    backgroundColor: colors.secondary, borderRadius: 12, padding: 14,
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },

  // Exercise name picker
  namePickerField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  namePickerText: { color: colors.text, fontSize: 15 },
  namePickerPlaceholder: { color: colors.textSecondary, fontSize: 15 },
  namePickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  namePickerSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 28,
    borderTopRightRadius: 28, padding: 24, maxHeight: '85%',
    // Android's KeyboardAvoidingView 'height' behavior shrinks this sheet's
    // whole flex-end container to sit flush against the keyboard's top
    // edge — reported as the picker looking "squashed" right against the
    // keyboard with no breathing room. A bottom margin lifts the sheet up
    // off the keyboard instead of touching it directly.
    marginBottom: 16,
  },
  namePickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  namePickerRowText: { fontSize: 15, color: colors.text, fontWeight: '500' },
  namePickerAddRow: { borderBottomWidth: 0, marginTop: 4 },
  namePickerAddText: { fontSize: 14, color: colors.xpBar, fontWeight: '700' },

  // Difficulty chips
  diffRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  diffChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.secondary, alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  diffChipActive: { borderColor: colors.xpBar, backgroundColor: colors.xpBar + '22' },
  diffChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  diffChipTextActive: { color: colors.xpBar },

  // Exercise builder
  // Category dropdown inside the picker modal — replaced the old
  // horizontal chip-scroll row (see openNamePicker).
  categoryDropdownField: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.secondary, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8,
  },
  categoryDropdownFieldText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  categoryDropdownList: {
    maxHeight: 220, marginBottom: 8, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.secondary,
  },
  categoryDropdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  categoryDropdownRowActive: { backgroundColor: colors.xpBar + '14' },
  categoryDropdownRowText: { flex: 1, fontSize: 14, color: colors.text },
  categoryDropdownRowTextActive: { color: colors.xpBar, fontWeight: '700' },
  // Replaces the old always-expanded chip grid — a single tappable field
  // that opens the searchable name picker modal instead (reused from the
  // per-row "rename" flow, now also used for "add", see openNamePicker).
  suggestedPickerField: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.secondary, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8,
  },
  suggestedPickerFieldText: { flex: 1, fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  exerciseRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  exNumBadge: {
    width: 28, height: 28, borderRadius: 8, marginTop: 14,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  exNumText: { fontSize: 13, fontWeight: '700', color: colors.xpBar },
  exFields: { flex: 1 },
  exMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  exMetaField: { flex: 1, minWidth: 70 },
  exMetaLabel: { fontSize: 9, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, marginBottom: 4 },
  exMetaInput: {
    backgroundColor: colors.secondary, borderRadius: 8, padding: 10,
    color: colors.text, fontSize: 13, borderWidth: 1, borderColor: colors.border, textAlign: 'center',
  },
  removeBtn: { padding: 8 },
  // Single Arm / Single Leg — a 3-way exclusive toggle, same visual
  // language as diffChip above but compact enough to sit under a row of
  // sets/reps/weight/time/rest fields without pushing the card too tall.
  lateralityRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  lateralityChip: {
    flex: 1, paddingVertical: 7, borderRadius: 8,
    backgroundColor: colors.secondary, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  lateralityChipActive: { borderColor: colors.xpBar, backgroundColor: colors.xpBar + '22' },
  lateralityChipText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  lateralityChipTextActive: { color: colors.xpBar },
  addExerciseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.xpBar, borderStyle: 'dashed',
    marginTop: 4, marginBottom: 16,
  },
  addExerciseBtnText: { fontSize: 14, fontWeight: '700', color: colors.xpBar },

  // Footer buttons
  backBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 12,
    backgroundColor: colors.secondary, alignItems: 'center',
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  nextBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: 12, backgroundColor: colors.primary,
    marginBottom: 20,
  },
  // Used when nextBtn sits next to backBtn in modalFooter — cancels nextBtn's own
  // marginBottom so a row-stretch alignment doesn't make it shorter than backBtn.
  nextBtnInFooter: { marginBottom: 0 },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontSize: 15, fontWeight: '700', color: colors.text },
});
