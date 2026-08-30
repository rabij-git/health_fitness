import React, { useState, useCallback } from 'react';
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
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { getNutritionPlans, getFoodLogEntries, addFoodLogEntry, deleteFoodLogEntry } from '../../lib/db';
import { DBNutritionPlan, DBFoodLogEntry } from '../../lib/supabase';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDay(dateStr: string) {
  if (dateStr === todayStr()) return 'Today';
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupByDay(entries: DBFoodLogEntry[]): { date: string; entries: DBFoodLogEntry[] }[] {
  const map = new Map<string, DBFoodLogEntry[]>();
  for (const e of entries) {
    if (!map.has(e.logged_at)) map.set(e.logged_at, []);
    map.get(e.logged_at)!.push(e);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, entries]) => ({ date, entries }));
}

function NutritionPlanCard({ plan, inactive }: { plan: DBNutritionPlan; inactive?: boolean }) {
  const hasTargets = plan.target_calories || plan.target_protein || plan.target_carbs || plan.target_fat;
  return (
    <View style={[styles.planCard, inactive && styles.planCardInactive]}>
      <View style={styles.planHeader}>
        <Ionicons name="restaurant" size={18} color={inactive ? colors.textSecondary : colors.xpBar} />
        <Text style={styles.planTitle}>{plan.title}</Text>
      </View>
      {hasTargets ? (
        <View style={styles.targetsRow}>
          {plan.target_calories != null && (
            <View style={styles.targetChip}>
              <Text style={styles.targetChipVal}>{plan.target_calories}</Text>
              <Text style={styles.targetChipLabel}>kcal</Text>
            </View>
          )}
          {plan.target_protein != null && (
            <View style={styles.targetChip}>
              <Text style={styles.targetChipVal}>{plan.target_protein}g</Text>
              <Text style={styles.targetChipLabel}>protein</Text>
            </View>
          )}
          {plan.target_carbs != null && (
            <View style={styles.targetChip}>
              <Text style={styles.targetChipVal}>{plan.target_carbs}g</Text>
              <Text style={styles.targetChipLabel}>carbs</Text>
            </View>
          )}
          {plan.target_fat != null && (
            <View style={styles.targetChip}>
              <Text style={styles.targetChipVal}>{plan.target_fat}g</Text>
              <Text style={styles.targetChipLabel}>fat</Text>
            </View>
          )}
        </View>
      ) : null}
      {plan.notes && <Text style={styles.planNotes}>{plan.notes}</Text>}
      {plan.file_url && (
        <TouchableOpacity style={styles.planDocRow} onPress={() => Linking.openURL(plan.file_url!)}>
          <Ionicons name="document-text" size={16} color={colors.xpBar} />
          <Text style={styles.planDocText} numberOfLines={1}>{plan.file_name}</Text>
          <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function FoodLogScreen({ userId }: { userId: string }) {
  const [plans, setPlans] = useState<DBNutritionPlan[]>([]);
  const [entries, setEntries] = useState<DBFoodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newFood, setNewFood] = useState('');
  const [newCalories, setNewCalories] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [nutritionPlans, foodEntries] = await Promise.all([getNutritionPlans(userId), getFoodLogEntries(userId)]);
    setPlans(nutritionPlans);
    setEntries(foodEntries);
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const activePlans = plans.filter(p => p.active);
  const pastPlans = plans.filter(p => !p.active);
  const targetPlan = activePlans.find(p => p.target_calories != null);
  const days = groupByDay(entries);
  const todayCalories = entries
    .filter(e => e.logged_at === todayStr())
    .reduce((sum, e) => sum + (e.calories ?? 0), 0);

  const handleAdd = async () => {
    if (!newFood.trim() || saving) return;
    setSaving(true);
    try {
      const calories = newCalories ? parseInt(newCalories, 10) : null;
      const entry = await addFoodLogEntry(userId, newFood.trim(), calories);
      setEntries(prev => [entry, ...prev]);
      setShowAdd(false);
      setNewFood('');
      setNewCalories('');
    } catch (e) {
      console.warn('addFoodLogEntry error', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback(async (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    try {
      await deleteFoodLogEntry(id);
    } catch (e) {
      console.warn('deleteFoodLogEntry error', e);
    }
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Nutrition</Text>
        <Text style={styles.subtitle}>Your nutrition plans and daily food log</Text>

        {targetPlan?.target_calories != null && (
          <View style={styles.todayProgressCard}>
            <Text style={styles.todayProgressText}>
              {todayCalories} / {targetPlan.target_calories} kcal today
            </Text>
            <View style={styles.progressBg}>
              <View style={[
                styles.progressFill,
                { width: `${Math.min(100, (todayCalories / targetPlan.target_calories) * 100)}%` as any },
              ]} />
            </View>
          </View>
        )}

        {plans.length === 0 && !loading ? (
          <View style={styles.emptyPlan}>
            <Ionicons name="restaurant-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.emptyPlanText}>Your coach hasn't set up a nutrition plan yet</Text>
          </View>
        ) : (
          <>
            {activePlans.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>ACTIVE PLANS</Text>
                {activePlans.map(plan => <NutritionPlanCard key={plan.id} plan={plan} />)}
              </>
            )}
            {pastPlans.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: activePlans.length > 0 ? 8 : 0 }]}>PAST PLANS</Text>
                {pastPlans.map(plan => <NutritionPlanCard key={plan.id} plan={plan} inactive />)}
              </>
            )}
          </>
        )}

        {/* Add Food */}
        <TouchableOpacity style={styles.addFoodBtn} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
          <Ionicons name="add-circle" size={18} color={colors.text} />
          <Text style={styles.addFoodBtnText}>Add Food</Text>
        </TouchableOpacity>

        {/* Food Log */}
        {days.length === 0 && !loading && (
          <View style={styles.emptyPlan}>
            <Ionicons name="fast-food-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.emptyPlanText}>No food logged yet — tap "Add Food" to start.</Text>
          </View>
        )}
        {days.map(day => (
          <View key={day.date} style={styles.dayGroup}>
            <Text style={styles.dayLabel}>{formatDay(day.date)}</Text>
            {day.entries.map(entry => (
              <View key={entry.id} style={styles.foodRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.foodName}>{entry.food_name}</Text>
                  {entry.calories != null && <Text style={styles.foodCalories}>{entry.calories} kcal</Text>}
                </View>
                <TouchableOpacity onPress={() => handleDelete(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Add Food Modal */}
      <Modal
        visible={showAdd}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowAdd(false); setNewFood(''); setNewCalories(''); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Add Food</Text>

              <Text style={styles.inputLabel}>What did you eat?</Text>
              <TextInput
                style={styles.input}
                value={newFood}
                onChangeText={setNewFood}
                placeholder="e.g. Grilled chicken salad"
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />

              <Text style={styles.inputLabel}>Calories (optional)</Text>
              <TextInput
                style={styles.input}
                value={newCalories}
                onChangeText={v => setNewCalories(v.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 450"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
              />

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => { setShowAdd(false); setNewFood(''); setNewCalories(''); }}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, (!newFood.trim() || saving) && { opacity: 0.5 }]}
                  onPress={handleAdd}
                  disabled={!newFood.trim() || saving}
                  activeOpacity={0.85}
                >
                  <Ionicons name="save" size={18} color={colors.text} />
                  <Text style={styles.saveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 6, marginTop: 8 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 20 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1.5, marginBottom: 10 },
  planCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: colors.xpBar + '44',
  },
  planCardInactive: { borderColor: colors.border, opacity: 0.7 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  targetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  targetChip: {
    backgroundColor: colors.secondary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border, minWidth: 70,
  },
  targetChipVal: { fontSize: 15, fontWeight: '800', color: colors.xpBar },
  targetChipLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '600', marginTop: 2 },
  planNotes: { fontSize: 13, color: colors.textSecondary, marginTop: 14, lineHeight: 19 },
  planDocRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border,
  },
  planDocText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  todayProgressCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  todayProgressText: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 },
  progressBg: { height: 8, backgroundColor: colors.secondary, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.xpBar, borderRadius: 4 },

  emptyPlan: { alignItems: 'center', paddingVertical: 24, gap: 10, marginBottom: 8 },
  emptyPlanText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 24 },

  addFoodBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15, marginBottom: 20,
  },
  addFoodBtnText: { color: colors.text, fontSize: 15, fontWeight: '700' },

  dayGroup: { marginBottom: 18 },
  dayLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1.5, marginBottom: 10 },
  foodRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  foodName: { fontSize: 14, fontWeight: '600', color: colors.text },
  foodCalories: { fontSize: 12, color: colors.xpBar, marginTop: 2, fontWeight: '600' },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 20 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, marginBottom: 8 },
  input: {
    backgroundColor: colors.secondary, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },
  modalFooter: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, padding: 15, borderRadius: 12, backgroundColor: colors.secondary, alignItems: 'center' },
  cancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 1, padding: 15, borderRadius: 12, backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  saveText: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
