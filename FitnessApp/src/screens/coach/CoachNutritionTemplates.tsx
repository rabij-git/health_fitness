import React, { useState, useEffect, useCallback } from 'react';
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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import {
  getNutritionTemplates,
  createNutritionTemplate,
  updateNutritionTemplate,
  deleteNutritionTemplate,
} from '../../lib/db';
import { DBNutritionPlanTemplate } from '../../lib/supabase';

interface Props {
  coachId: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CoachNutritionTemplates({ coachId }: Props) {
  const [templates, setTemplates] = useState<DBNutritionPlanTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Add/Edit modal (shared form) ──
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DBNutritionPlanTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  const loadTemplates = useCallback(async () => {
    setLoadError(false);
    try {
      const rows = await getNutritionTemplates(coachId);
      setTemplates(rows);
    } catch (e) {
      console.warn('getNutritionTemplates error', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const openAddForm = () => {
    setEditingTemplate(null);
    setTitle('');
    setNotes('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setShowForm(true);
  };

  const openEditForm = (template: DBNutritionPlanTemplate) => {
    setEditingTemplate(template);
    setTitle(template.title);
    setNotes(template.notes ?? '');
    setCalories(template.target_calories != null ? String(template.target_calories) : '');
    setProtein(template.target_protein != null ? String(template.target_protein) : '');
    setCarbs(template.target_carbs != null ? String(template.target_carbs) : '');
    setFat(template.target_fat != null ? String(template.target_fat) : '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const fields = {
      title: title.trim(),
      notes: notes.trim() || null,
      target_calories: calories ? parseInt(calories, 10) : null,
      target_protein: protein ? parseInt(protein, 10) : null,
      target_carbs: carbs ? parseInt(carbs, 10) : null,
      target_fat: fat ? parseInt(fat, 10) : null,
    };
    try {
      if (editingTemplate) {
        const updated = await updateNutritionTemplate(editingTemplate.id, fields);
        setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
      } else {
        const created = await createNutritionTemplate(coachId, fields);
        setTemplates(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch (e) {
      console.warn('save nutrition template error', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback((template: DBNutritionPlanTemplate) => {
    Alert.alert(
      'Delete Template',
      `Delete "${template.title}"? Trainees already assigned this plan keep their copy — this only removes the reusable template.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(template.id);
            try {
              await deleteNutritionTemplate(template.id);
              setTemplates(prev => prev.filter(t => t.id !== template.id));
            } catch (e) {
              console.warn('deleteNutritionTemplate error', e);
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Nutrition Plans</Text>
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={openAddForm} activeOpacity={0.85}>
          <Ionicons name="add-circle" size={20} color={colors.text} />
          <Text style={styles.addBtnText}>Add Nutrition Plan</Text>
        </TouchableOpacity>

        {loading && (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        {!loading && loadError && (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyText}>Couldn't load nutrition plans</Text>
            <Text style={styles.emptySub}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); loadTemplates(); }}>
              <Ionicons name="refresh" size={16} color={colors.text} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {!loading && !loadError && templates.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No nutrition plans yet</Text>
            <Text style={styles.emptySub}>Tap "Add Nutrition Plan" above to create a reusable plan you can assign to any trainee.</Text>
          </View>
        )}
        {!loading && !loadError && templates.map(template => {
          const hasTargets = template.target_calories || template.target_protein || template.target_carbs || template.target_fat;
          return (
            <TouchableOpacity key={template.id} style={styles.card} activeOpacity={0.8} onPress={() => openEditForm(template)}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIcon}>
                  <Ionicons name="restaurant" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{template.title}</Text>
                  {hasTargets && (
                    <View style={styles.targetsRow}>
                      {template.target_calories != null && <Text style={styles.targetPill}>{template.target_calories} kcal</Text>}
                      {template.target_protein != null && <Text style={styles.targetPill}>{template.target_protein}g protein</Text>}
                      {template.target_carbs != null && <Text style={styles.targetPill}>{template.target_carbs}g carbs</Text>}
                      {template.target_fat != null && <Text style={styles.targetPill}>{template.target_fat}g fat</Text>}
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </View>
              {template.notes && <Text style={styles.cardNotes}>{template.notes}</Text>}
              <View style={styles.cardFooter}>
                <Text style={styles.createdText}>Created {formatDate(template.created_at)}</Text>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(template)}
                  disabled={deletingId === template.id}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {deletingId === template.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Add/Edit Modal ── */}
      <Modal
        visible={showForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowForm(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingTemplate ? 'Edit Nutrition Plan' : 'New Nutrition Plan'}</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>PLAN TITLE</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Cutting Phase"
                placeholderTextColor={colors.textSecondary}
                value={title}
                onChangeText={setTitle}
                autoFocus
              />

              <Text style={[styles.fieldLabel, { marginTop: 4 }]}>DAILY TARGETS (OPTIONAL)</Text>
              <View style={styles.targetRow}>
                <View style={styles.targetField}>
                  <Text style={styles.targetFieldLabel}>CALORIES</Text>
                  <TextInput
                    style={styles.targetInput}
                    value={calories}
                    onChangeText={v => setCalories(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.targetField}>
                  <Text style={styles.targetFieldLabel}>PROTEIN (G)</Text>
                  <TextInput
                    style={styles.targetInput}
                    value={protein}
                    onChangeText={v => setProtein(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
              <View style={styles.targetRow}>
                <View style={styles.targetField}>
                  <Text style={styles.targetFieldLabel}>CARBS (G)</Text>
                  <TextInput
                    style={styles.targetInput}
                    value={carbs}
                    onChangeText={v => setCarbs(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.targetField}>
                  <Text style={styles.targetFieldLabel}>FAT (G)</Text>
                  <TextInput
                    style={styles.targetInput}
                    value={fat}
                    onChangeText={v => setFat(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>NOTES (OPTIONAL)</Text>
              <TextInput
                style={[styles.textInput, { height: 90, textAlignVertical: 'top' }]}
                placeholder="e.g. Prioritize protein at every meal, avoid sugary drinks..."
                placeholderTextColor={colors.textSecondary}
                value={notes}
                onChangeText={setNotes}
                multiline
              />

              <TouchableOpacity
                style={[styles.saveBtn, (!title.trim() || saving) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!title.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <>
                    <Ionicons name={editingTemplate ? 'checkmark' : 'add-circle'} size={18} color={colors.text} />
                    <Text style={styles.saveBtnText}>{editingTemplate ? 'Save Changes' : 'Create Plan'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
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

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FF8C00', borderRadius: 12, paddingVertical: 14, marginBottom: 20,
  },
  addBtnText: { fontSize: 15, fontWeight: '700', color: colors.text },

  card: {
    backgroundColor: colors.card, borderRadius: 16,
    padding: 18, marginBottom: 14, borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  cardIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: colors.primary + '22',
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
  targetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  targetPill: {
    fontSize: 11, fontWeight: '700', color: colors.xpBar,
    backgroundColor: colors.xpBar + '1a', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  cardNotes: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 14 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  createdText: { fontSize: 12, color: colors.textSecondary },
  deleteBtn: { padding: 4 },

  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.secondary, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 10, marginTop: 8, borderWidth: 1, borderColor: colors.border,
  },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: colors.text },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 28,
    borderTopRightRadius: 28, padding: 24, maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.text, flex: 1, marginRight: 12 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center',
  },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1.5, marginBottom: 8 },
  textInput: {
    backgroundColor: colors.secondary, borderRadius: 12, padding: 14,
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },
  targetRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  targetField: { flex: 1 },
  targetFieldLabel: { fontSize: 9, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, marginBottom: 4 },
  targetInput: {
    backgroundColor: colors.secondary, borderRadius: 8, padding: 10,
    color: colors.text, fontSize: 13, borderWidth: 1, borderColor: colors.border, textAlign: 'center',
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: 12, backgroundColor: colors.primary,
    marginTop: 8, marginBottom: 20,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: colors.text },
});
