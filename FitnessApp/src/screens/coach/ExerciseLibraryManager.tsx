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
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { getExerciseLibrary, createLibraryExercise, updateLibraryExercise, deleteLibraryExercise } from '../../lib/db';
import { DBLibraryExercise } from '../../lib/supabase';
import { sanitizeCount, sanitizeWeightInput, sanitizeTimeInput, stripKg, withKg } from '../../lib/exerciseInput';

interface Props {
  visible: boolean;
  coachId: string;
  onClose: () => void;
  onChange?: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  Push: 'arrow-up-circle',
  Pull: 'arrow-down-circle',
  Legs: 'fitness',
  Core: 'body',
  Cardio: 'heart',
  Stretch: 'accessibility-outline',
};

export default function ExerciseLibraryManager({ visible, coachId, onClose, onChange }: Props) {
  const [library, setLibrary] = useState<DBLibraryExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Push');
  const [formSets, setFormSets] = useState('3');
  const [formReps, setFormReps] = useState('10');
  const [formWeight, setFormWeight] = useState('');
  const [formTime, setFormTime] = useState('0');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getExerciseLibrary();
    setLibrary(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const categories = useMemo(() => {
    const known = ['Push', 'Pull', 'Legs', 'Core', 'Cardio', 'Stretch'];
    const fromLibrary = Array.from(new Set(library.map(e => e.category)));
    return Array.from(new Set([...known, ...fromLibrary]));
  }, [library]);

  const grouped = useMemo(() => {
    const groups: Record<string, DBLibraryExercise[]> = {};
    library.forEach(ex => {
      if (!groups[ex.category]) groups[ex.category] = [];
      groups[ex.category].push(ex);
    });
    return groups;
  }, [library]);

  const openAddForm = (category?: string) => {
    setEditingId(null);
    setFormName('');
    setFormCategory(category ?? categories[0] ?? 'Push');
    setFormSets('3');
    setFormReps('10');
    setFormWeight('');
    setFormTime('0');
    setShowForm(true);
  };

  const openEditForm = (ex: DBLibraryExercise) => {
    setEditingId(ex.id);
    setFormName(ex.name);
    setFormCategory(ex.category);
    setFormSets(sanitizeCount(String(ex.default_sets), 1, 6));
    setFormReps(sanitizeCount(ex.default_reps, 1, 30));
    setFormWeight(stripKg(ex.default_weight));
    setFormTime(sanitizeTimeInput(ex.default_time ?? '0'));
    setShowForm(true);
  };

  const handleDelete = useCallback(async (ex: DBLibraryExercise) => {
    setLibrary(prev => prev.filter(e => e.id !== ex.id));
    try {
      await deleteLibraryExercise(ex.id);
      onChange?.();
    } catch (e) {
      console.warn('deleteLibraryExercise error', e);
    }
  }, [onChange]);

  const handleSave = async () => {
    if (!formName.trim() || !formCategory.trim() || saving) return;
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        category: formCategory.trim(),
        default_sets: parseInt(formSets) || 3,
        default_reps: formReps.trim() || '10',
        default_weight: withKg(formWeight),
        default_time: formTime.trim() || '0',
      };
      if (editingId) {
        await updateLibraryExercise(editingId, payload);
      } else {
        await createLibraryExercise({ ...payload, created_by: coachId });
      }
      await load();
      onChange?.();
      setShowForm(false);
    } catch (e) {
      console.warn('save library exercise error', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => (showForm ? setShowForm(false) : onClose())}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{showForm ? (editingId ? 'Edit Exercise' : 'New Exercise') : 'Exercise Library'}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={() => (showForm ? setShowForm(false) : onClose())}>
              <Ionicons name={showForm ? 'arrow-back' : 'close'} size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {!showForm ? (
            <>
              <Text style={styles.subtitle}>Shared across all coaches — used when building any program.</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => openAddForm()} activeOpacity={0.85}>
                <Ionicons name="add-circle" size={18} color={colors.text} />
                <Text style={styles.addBtnText}>Add Exercise</Text>
              </TouchableOpacity>

              {loading ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {categories.map(category => (
                    <View key={category} style={{ marginBottom: 18 }}>
                      <TouchableOpacity style={styles.categoryHeaderRow} onPress={() => openAddForm(category)} activeOpacity={0.7}>
                        <Ionicons name={(CATEGORY_ICONS[category] ?? 'ellipse') as any} size={16} color={colors.xpBar} />
                        <Text style={styles.categoryHeaderText}>{category}</Text>
                        <Ionicons name="add-circle-outline" size={16} color={colors.xpBar} style={{ marginLeft: 'auto' }} />
                      </TouchableOpacity>
                      {(grouped[category] ?? []).length === 0 ? (
                        <Text style={styles.emptyCategoryText}>No exercises yet</Text>
                      ) : (
                        grouped[category].map(ex => (
                          <View key={ex.id} style={styles.exRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.exName}>{ex.name}</Text>
                              <Text style={styles.exMeta}>
                                {ex.default_sets} sets × {ex.default_reps}{ex.default_weight ? ` · ${ex.default_weight}` : ''}{ex.default_time && ex.default_time !== '0' ? ` · ${ex.default_time}` : ''}
                              </Text>
                            </View>
                            <TouchableOpacity onPress={() => openEditForm(ex)} style={styles.iconBtn}>
                              <Ionicons name="create-outline" size={18} color={colors.xpBar} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDelete(ex)} style={styles.iconBtn}>
                              <Ionicons name="trash-outline" size={18} color={colors.primary} />
                            </TouchableOpacity>
                          </View>
                        ))
                      )}
                    </View>
                  ))}
                </ScrollView>
              )}
            </>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>EXERCISE NAME</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Barbell Bench Press"
                placeholderTextColor={colors.textSecondary}
                value={formName}
                onChangeText={setFormName}
                autoFocus
              />

              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.categoryRow, { marginBottom: 16 }]}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryChip, formCategory === cat && styles.categoryChipActive, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                    onPress={() => setFormCategory(cat)}
                  >
                    <Ionicons
                      name={(CATEGORY_ICONS[cat] ?? 'ellipse') as any}
                      size={14}
                      color={formCategory === cat ? colors.text : colors.textSecondary}
                    />
                    <Text style={[styles.categoryChipText, formCategory === cat && styles.categoryChipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.exMetaRow}>
                <View style={styles.exMetaField}>
                  <Text style={styles.fieldLabel} numberOfLines={1}>SETS (1-6)</Text>
                  <TextInput
                    style={styles.metaInput}
                    value={formSets}
                    onChangeText={v => setFormSets(sanitizeCount(v, 1, 6))}
                    keyboardType="number-pad"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.exMetaField}>
                  <Text style={styles.fieldLabel} numberOfLines={1}>REPS (1-30)</Text>
                  <TextInput
                    style={styles.metaInput}
                    value={formReps}
                    onChangeText={v => setFormReps(sanitizeCount(v, 1, 30))}
                    keyboardType="number-pad"
                    placeholder="10"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.exMetaField}>
                  <Text style={styles.fieldLabel} numberOfLines={1}>WEIGHT</Text>
                  <TextInput
                    style={styles.metaInput}
                    value={formWeight}
                    onChangeText={v => setFormWeight(sanitizeWeightInput(v))}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.exMetaField}>
                  <Text style={styles.fieldLabel} numberOfLines={1}>TIME (S/M)</Text>
                  <TextInput
                    style={styles.metaInput}
                    value={formTime}
                    onChangeText={v => setFormTime(sanitizeTimeInput(v))}
                    placeholder="e.g. 30s"
                    keyboardType="default"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, (!formName.trim() || !formCategory.trim() || saving) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!formName.trim() || !formCategory.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color={colors.text} />
                    <Text style={styles.saveBtnText}>{editingId ? 'Save Changes' : 'Add to Library'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 28,
    borderTopRightRadius: 28, padding: 24, maxHeight: '90%', minHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 8,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center',
  },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, marginBottom: 16,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: colors.text },

  categoryHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  categoryHeaderText: { fontSize: 13, fontWeight: '700', color: colors.xpBar, letterSpacing: 1, textTransform: 'uppercase' },
  exRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.secondary, borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  exName: { fontSize: 14, fontWeight: '700', color: colors.text },
  exMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  emptyCategoryText: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' },
  iconBtn: { padding: 6 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1.5, marginBottom: 8 },
  textInput: {
    backgroundColor: colors.secondary, borderRadius: 12, padding: 14,
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },
  categoryRow: { marginBottom: 8 },
  categoryChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.secondary, marginRight: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  categoryChipTextActive: { color: colors.text },

  exMetaRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  exMetaField: { flex: 1 },
  metaInput: {
    backgroundColor: colors.secondary, borderRadius: 8, padding: 12,
    color: colors.text, fontSize: 13, borderWidth: 1, borderColor: colors.border, textAlign: 'center',
  },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: 12, backgroundColor: colors.primary,
    marginBottom: 20,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: colors.text },
});
