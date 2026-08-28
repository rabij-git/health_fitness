import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { colors } from '../../theme/colors';
import { getPrograms, createProgram, updateProgram, getProgramExercises, updateProgramExercises, getExerciseLibrary, createLibraryExercise } from '../../lib/db';
import { DBProgram, DBLibraryExercise } from '../../lib/supabase';
import ExerciseLibraryManager from './ExerciseLibraryManager';
import { sanitizeCount, sanitizeWeightInput, stripKg, withKg } from '../../lib/exerciseInput';

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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function exercisesPayload(exercises: ExerciseEntry[]) {
  return exercises.filter(e => e.name.trim()).map((e) => ({
    id: e.dbId,
    name: e.name,
    sets: parseInt(e.sets) || 3,
    reps: e.reps || '10',
    weight: withKg(e.weight),
  }));
}

export default function CoachPrograms({ coachId }: Props) {
  const [programs, setPrograms] = useState<DBProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    loadPrograms();
    loadLibrary();
  }, [loadPrograms, loadLibrary]);

  const categories = useMemo(() => {
    const known = ['Push', 'Pull', 'Legs', 'Core'];
    return Array.from(new Set([...known, ...library.map(e => e.category)]));
  }, [library]);

  // ── Exercise name picker (dropdown sourced from the shared library, with inline "add new") ──
  const [showNamePicker, setShowNamePicker] = useState(false);
  const [namePickerQuery, setNamePickerQuery] = useState('');
  const [savingNewName, setSavingNewName] = useState(false);
  const namePickerOnSelectRef = useRef<((name: string) => void) | null>(null);
  const namePickerCategoryRef = useRef('Push');

  const uniqueLibraryNames = useMemo(
    () => Array.from(new Set(library.map(e => e.name))).sort((a, b) => a.localeCompare(b)),
    [library]
  );

  const filteredLibraryNames = useMemo(() => {
    const q = namePickerQuery.trim().toLowerCase();
    if (!q) return uniqueLibraryNames;
    return uniqueLibraryNames.filter(n => n.toLowerCase().includes(q));
  }, [uniqueLibraryNames, namePickerQuery]);

  const namePickerExactMatch = uniqueLibraryNames.some(
    n => n.toLowerCase() === namePickerQuery.trim().toLowerCase()
  );

  const openNamePicker = useCallback((onSelect: (name: string) => void, category: string) => {
    namePickerOnSelectRef.current = onSelect;
    namePickerCategoryRef.current = category;
    setNamePickerQuery('');
    setShowNamePicker(true);
  }, []);

  const handlePickName = useCallback((name: string) => {
    namePickerOnSelectRef.current?.(name);
    setShowNamePicker(false);
  }, []);

  const handleAddNewName = useCallback(async () => {
    const name = namePickerQuery.trim();
    if (!name || savingNewName) return;
    setSavingNewName(true);
    try {
      await createLibraryExercise({
        name,
        category: namePickerCategoryRef.current,
        default_sets: 3,
        default_reps: '10',
        created_by: coachId,
      });
      await loadLibrary();
      namePickerOnSelectRef.current?.(name);
      setShowNamePicker(false);
    } catch (e) {
      console.warn('createLibraryExercise error', e);
    } finally {
      setSavingNewName(false);
    }
  }, [namePickerQuery, savingNewName, coachId, loadLibrary]);

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

  const addSuggestedExercise = useCallback((item: { name: string; sets: string; reps: string; weight: string }) => {
    setExercises(prev => {
      const lastIdx = prev.length - 1;
      if (prev[lastIdx] && !prev[lastIdx].name.trim()) {
        return prev.map((e, i) => i === lastIdx ? { ...e, ...item, id: e.id } : e);
      }
      return [...prev, { id: String(Date.now() + Math.random()), ...item }];
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
          }))
        : [buildEmptyExercise()]
    );
    setLoadingEditExercises(false);
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
            </View>
          </TouchableOpacity>
        ))}
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
                <TouchableOpacity onPress={() => setShowLibraryManager(true)}>
                  <Text style={styles.manageLibraryText}>Manage Library</Text>
                </TouchableOpacity>
              </View>
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
                        activeCategory
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
      <Modal visible={showEditProgram} transparent animationType="slide">
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
                  <TouchableOpacity onPress={() => setShowLibraryManager(true)}>
                    <Text style={styles.manageLibraryText}>Manage Library</Text>
                  </TouchableOpacity>
                </View>
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
                    <View style={styles.exFields}>
                      <TouchableOpacity
                        style={[styles.textInput, styles.namePickerField, { marginBottom: 8 }]}
                        onPress={() => openNamePicker(
                          name => setEditExercises(prev => prev.map(e => e.id === ex.id ? { ...e, name } : e)),
                          editActiveCategory
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

                <View style={styles.modalFooter}>
                  <TouchableOpacity style={styles.backBtn} onPress={() => setShowEditProgram(false)}>
                    <Text style={styles.backBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.nextBtn, (!editProgName.trim() || saving) && styles.nextBtnDisabled]}
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
        onClose={() => setShowLibraryManager(false)}
        onChange={loadLibrary}
      />

      {/* ── Exercise Name Picker ── */}
      <Modal visible={showNamePicker} transparent animationType="slide">
        <View style={styles.namePickerOverlay}>
          <View style={styles.namePickerSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Exercise</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setShowNamePicker(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="Search or type a new exercise name..."
              placeholderTextColor={colors.textSecondary}
              value={namePickerQuery}
              onChangeText={setNamePickerQuery}
              autoFocus
            />
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 340 }}>
              {filteredLibraryNames.map(name => (
                <TouchableOpacity key={name} style={styles.namePickerRow} onPress={() => handlePickName(name)}>
                  <Ionicons name="barbell-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.namePickerRowText}>{name}</Text>
                </TouchableOpacity>
              ))}
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
                  No exercises in the library yet — type a name above to add one.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
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
  programFooter: { flexDirection: 'row', alignItems: 'center' },
  createdText: { fontSize: 12, color: colors.textSecondary },

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
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontSize: 15, fontWeight: '700', color: colors.text },
});
