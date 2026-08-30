import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { getXpForNextLevel, getCurrentLevelXp } from '../../data/mockData';
import {
  getProfile,
  getWeightLogs,
  getNutritionPlans,
  searchCoaches,
  sendCoachRequest,
  getIncomingCoachRequestForTrainee,
  getOutgoingCoachRequestForTrainee,
  acceptCoachRequest,
  declineCoachRequest,
} from '../../lib/db';
import { DBUser, DBWeightLog, DBNutritionPlan, DBCoachRequest } from '../../lib/supabase';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  onLogout: () => void;
  userId: string;
}

function WeightChart({ logs }: { logs: DBWeightLog[] }) {
  if (logs.length === 0) {
    return (
      <View style={[styles.chartContainer, { alignItems: 'center', paddingVertical: 24 }]}>
        <Text style={styles.chartTitle}>Body Weight</Text>
        <Ionicons name="scale-outline" size={32} color={colors.textSecondary} style={{ marginTop: 8 }} />
        <Text style={{ color: colors.textSecondary, marginTop: 8, fontSize: 13 }}>No weight entries yet</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>Log your weight on the Home tab</Text>
      </View>
    );
  }

  const recent = [...logs].reverse().slice(-7);
  const weights = recent.map(l => l.weight_kg);
  const maxW = Math.max(...weights);
  const minW = Math.min(...weights);
  const range = maxW - minW || 1;
  const change = weights[weights.length - 1] - weights[0];

  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>Body Weight ({recent.length} entries)</Text>
      <View style={styles.chart}>
        {recent.map((entry, index) => {
          const normalized = (entry.weight_kg - minW) / range;
          const barHeight = 20 + normalized * 80;
          const label = entry.logged_at.split('-').slice(1).join('/');
          return (
            <View key={entry.id} style={styles.chartBar}>
              <Text style={styles.chartValue}>{entry.weight_kg}</Text>
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: index === recent.length - 1 ? colors.xpBar : colors.accent,
                  },
                ]}
              />
              <Text style={styles.chartDate}>{label}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.chartFooter}>
        <View style={styles.chartLegend}>
          <View style={[styles.legendDot, { backgroundColor: colors.xpBar }]} />
          <Text style={styles.legendText}>Latest</Text>
        </View>
        <Text style={[styles.chartChange, { color: change <= 0 ? colors.xpBar : colors.primary }]}>
          {change > 0 ? '+' : ''}{change.toFixed(1)} kg
        </Text>
      </View>
    </View>
  );
}

export default function ProfileScreen({ onLogout, userId }: Props) {
  const [profile, setProfile] = useState<DBUser | null>(null);
  const [weightLogs, setWeightLogs] = useState<DBWeightLog[]>([]);
  const [coachProfile, setCoachProfile] = useState<DBUser | null>(null);
  const [nutritionPlans, setNutritionPlans] = useState<DBNutritionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const [incomingRequest, setIncomingRequest] = useState<(DBCoachRequest & { coach: DBUser }) | null>(null);
  const [outgoingRequest, setOutgoingRequest] = useState<(DBCoachRequest & { coach: DBUser }) | null>(null);
  const [respondingRequest, setRespondingRequest] = useState(false);

  const [showFindCoach, setShowFindCoach] = useState(false);
  const [coachSearchQuery, setCoachSearchQuery] = useState('');
  const [coachSearchResults, setCoachSearchResults] = useState<DBUser[]>([]);
  const [searchingCoaches, setSearchingCoaches] = useState(false);
  const [sendingRequestTo, setSendingRequestTo] = useState<string | null>(null);

  const loadAll = useCallback(() => {
    return Promise.all([
      getProfile(userId),
      getWeightLogs(userId),
      getNutritionPlans(userId),
      getIncomingCoachRequestForTrainee(userId),
      getOutgoingCoachRequestForTrainee(userId),
    ]).then(([p, logs, plans, incoming, outgoing]) => {
      setProfile(p);
      setWeightLogs(logs);
      setNutritionPlans(plans);
      setIncomingRequest(incoming);
      setOutgoingRequest(outgoing);
      setLoading(false);
      if (p?.coach_id) {
        getProfile(p.coach_id).then(setCoachProfile);
      }
    });
  }, [userId]);

  useFocusEffect(useCallback(() => {
    loadAll();
  }, [loadAll]));

  const handleSearchCoaches = useCallback(async (query: string) => {
    setCoachSearchQuery(query);
    if (query.trim().length < 2) { setCoachSearchResults([]); return; }
    setSearchingCoaches(true);
    const results = await searchCoaches(query.trim(), userId);
    setCoachSearchResults(results);
    setSearchingCoaches(false);
  }, [userId]);

  const handleSendCoachRequest = useCallback(async (coach: DBUser) => {
    setSendingRequestTo(coach.id);
    try {
      await sendCoachRequest(coach.id, userId, 'trainee');
      setOutgoingRequest({
        id: '', coach_id: coach.id, trainee_id: userId,
        initiated_by: 'trainee', status: 'pending', created_at: '', coach,
      });
      setShowFindCoach(false);
      setCoachSearchQuery('');
      setCoachSearchResults([]);
    } catch (e) {
      console.warn('sendCoachRequest error', e);
    } finally {
      setSendingRequestTo(null);
    }
  }, [userId]);

  const handleAcceptRequest = useCallback(async () => {
    if (!incomingRequest) return;
    setRespondingRequest(true);
    try {
      await acceptCoachRequest(incomingRequest.id, incomingRequest.coach_id, userId);
      await loadAll();
    } catch (e) {
      console.warn('acceptCoachRequest error', e);
    } finally {
      setRespondingRequest(false);
    }
  }, [incomingRequest, userId, loadAll]);

  const handleDeclineRequest = useCallback(async () => {
    if (!incomingRequest) return;
    setRespondingRequest(true);
    try {
      await declineCoachRequest(incomingRequest.id);
      setIncomingRequest(null);
    } catch (e) {
      console.warn('declineCoachRequest error', e);
    } finally {
      setRespondingRequest(false);
    }
  }, [incomingRequest]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const name = profile?.name ?? '—';
  const avatar = profile?.avatar ?? '?';
  const level = profile?.level ?? 1;
  const xp = profile?.xp ?? 0;
  const streak = profile?.streak ?? 0;

  const xpForNext = getXpForNextLevel(level);
  const currentLevelXp = getCurrentLevelXp(xp);
  const xpProgress = currentLevelXp / xpForNext;

  const stats = [
    { label: 'Day Streak', value: `${streak}d`, icon: 'flame', color: colors.streak },
    { label: 'Total XP', value: xp.toLocaleString(), icon: 'star', color: colors.gold },
    { label: 'Level', value: String(level), icon: 'trophy', color: colors.xpBar },
    { label: 'Weight Logs', value: String(weightLogs.length), icon: 'scale', color: colors.primary },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatar}</Text>
            </View>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>{level}</Text>
            </View>
          </View>
          <Text style={styles.profileName}>{name}</Text>

          <View style={styles.titleBadge}>
            <Ionicons name="star" size={12} color={colors.textSecondary} />
            <Text style={styles.titleText}>New Adventurer</Text>
          </View>

          {/* XP Bar */}
          <View style={styles.xpSection}>
            <Text style={styles.xpText}>
              {currentLevelXp} / {xpForNext} XP
            </Text>
            <View style={styles.xpBg}>
              <View style={[styles.xpFill, { width: `${xpProgress * 100}%` as any }]} />
            </View>
            <Text style={styles.xpNextText}>
              {xpForNext - currentLevelXp} XP to Level {level + 1}
            </Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: stat.color + '22' }]}>
                <Ionicons name={stat.icon as any} size={20} color={stat.color} />
              </View>
              <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Weight Chart */}
        <WeightChart logs={weightLogs} />

        {/* Nutrition Documents — quick access to any uploaded PDFs; full plan
            details (targets, notes, active/inactive) live on the Log tab's
            "Nutrition" segment instead. */}
        {nutritionPlans.some(p => p.file_url) && (
          <View style={styles.nutritionCard}>
            <Text style={styles.nutritionTitle}>Nutrition Documents</Text>
            {nutritionPlans.filter(p => p.file_url).map((plan, index, arr) => (
              <TouchableOpacity
                key={plan.id}
                style={[styles.nutritionRow, index < arr.length - 1 && styles.nutritionRowBorder]}
                onPress={() => Linking.openURL(plan.file_url!)}
                activeOpacity={0.7}
              >
                <View style={styles.nutritionIcon}>
                  <Ionicons name="document-text" size={18} color={colors.xpBar} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nutritionFileName} numberOfLines={1}>{plan.file_name}</Text>
                  <Text style={styles.nutritionDate}>Added {formatDate(plan.created_at)}</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Coach Card */}
        <View style={styles.coachCard}>
          <Text style={styles.coachCardTitle}>Your Coach</Text>

          {incomingRequest && (
            <View style={styles.requestBanner}>
              <View style={styles.coachRow}>
                <View style={styles.coachAvatar}>
                  <Text style={styles.coachAvatarText}>{incomingRequest.coach.avatar}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.coachName}>{incomingRequest.coach.name}</Text>
                  <Text style={styles.coachSub}>Wants to be your coach</Text>
                </View>
              </View>
              <View style={styles.requestActions}>
                <TouchableOpacity
                  style={styles.declineBtn}
                  onPress={handleDeclineRequest}
                  disabled={respondingRequest}
                >
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={handleAcceptRequest}
                  disabled={respondingRequest}
                >
                  {respondingRequest ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {coachProfile ? (
            <View style={styles.coachRow}>
              <View style={styles.coachAvatar}>
                <Text style={styles.coachAvatarText}>{coachProfile.avatar}</Text>
              </View>
              <View>
                <Text style={styles.coachName}>{coachProfile.name}</Text>
              </View>
            </View>
          ) : outgoingRequest ? (
            <View style={styles.coachRow}>
              <View style={styles.coachAvatar}>
                <Text style={styles.coachAvatarText}>{outgoingRequest.coach.avatar}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.coachName}>{outgoingRequest.coach.name}</Text>
                <Text style={styles.coachSub}>Request sent — waiting for approval</Text>
              </View>
            </View>
          ) : !incomingRequest ? (
            <>
              <View style={styles.coachEmpty}>
                <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.coachEmptyText}>Not assigned to a coach yet</Text>
              </View>
              <TouchableOpacity style={styles.findCoachBtn} onPress={() => setShowFindCoach(true)}>
                <Ionicons name="search" size={16} color={colors.text} />
                <Text style={styles.findCoachBtnText}>Find a Coach</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        {/* Settings Quick Links */}
        <View style={styles.menuCard}>
          {[
            { icon: 'settings', label: 'Settings' },
            { icon: 'shield-checkmark', label: 'Privacy' },
            { icon: 'help-circle', label: 'Help & Support' },
          ].map((item, index, arr) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuItem, index < arr.length - 1 && styles.menuItemBorder]}
              activeOpacity={0.7}
            >
              <View style={styles.menuLeft}>
                <Ionicons name={item.icon as any} size={18} color={colors.textSecondary} />
                <Text style={styles.menuLabel}>{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.primary} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Find a Coach Modal */}
      <Modal
        visible={showFindCoach}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowFindCoach(false); setCoachSearchQuery(''); setCoachSearchResults([]); }}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Find a Coach</Text>
              <TouchableOpacity onPress={() => { setShowFindCoach(false); setCoachSearchQuery(''); setCoachSearchResults([]); }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or email..."
              placeholderTextColor={colors.textSecondary}
              value={coachSearchQuery}
              onChangeText={handleSearchCoaches}
              autoFocus
            />
            {searchingCoaches && <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />}
            {!searchingCoaches && coachSearchQuery.length >= 2 && coachSearchResults.length === 0 && (
              <Text style={styles.noResults}>No coaches found</Text>
            )}
            <ScrollView>
              {coachSearchResults.map(coach => (
                <View key={coach.id} style={styles.searchRow}>
                  <View style={styles.coachAvatar}>
                    <Text style={styles.coachAvatarText}>{coach.avatar}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.coachName}>{coach.name}</Text>
                    <Text style={styles.coachSub}>{coach.email}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.sendRequestBtn}
                    onPress={() => handleSendCoachRequest(coach)}
                    disabled={sendingRequestTo === coach.id}
                  >
                    {sendingRequestTo === coach.id ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <Ionicons name="person-add" size={16} color={colors.text} />
                    )}
                  </TouchableOpacity>
                </View>
              ))}
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

  profileHeader: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarWrapper: { position: 'relative', marginBottom: 12 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.xpBar,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: colors.text },
  levelBadge: {
    position: 'absolute',
    bottom: 0,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  levelBadgeText: { fontSize: 12, fontWeight: '800', color: colors.text },
  profileName: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 8 },
  titleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.textSecondary + '22',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    marginBottom: 16,
  },
  titleText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  xpSection: { width: '100%' },
  xpText: { fontSize: 12, color: colors.xpBar, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  xpBg: { height: 10, backgroundColor: colors.secondary, borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  xpFill: { height: '100%', backgroundColor: colors.xpBar, borderRadius: 5 },
  xpNextText: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    width: '47%',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: colors.textSecondary, textAlign: 'center', fontWeight: '500' },

  chartContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chartTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 16 },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
    marginBottom: 8,
  },
  chartBar: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  chartValue: { fontSize: 9, color: colors.textSecondary, fontWeight: '600' },
  bar: { width: 24, borderRadius: 4 },
  chartDate: { fontSize: 9, color: colors.textSecondary, fontWeight: '600' },
  chartFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 4,
  },
  chartLegend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: colors.textSecondary },
  chartChange: { fontSize: 12, fontWeight: '600' },

  nutritionCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nutritionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 14 },
  nutritionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  nutritionRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  nutritionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.xpBar + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nutritionFileName: { fontSize: 14, fontWeight: '600', color: colors.text },
  nutritionDate: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

  coachCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  coachCardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 14 },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coachAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachAvatarText: { fontSize: 16, fontWeight: '800', color: colors.text },
  coachName: { fontSize: 15, fontWeight: '700', color: colors.text },
  coachSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  coachEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coachEmptyText: { fontSize: 13, color: colors.textSecondary },
  findCoachBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, marginTop: 14,
  },
  findCoachBtnText: { fontSize: 14, fontWeight: '700', color: colors.text },

  requestBanner: {
    backgroundColor: colors.xpBar + '11',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.xpBar + '44',
    gap: 12,
  },
  requestActions: { flexDirection: 'row', gap: 10 },
  declineBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.secondary, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  declineBtnText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  acceptBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.xpBar, alignItems: 'center',
  },
  acceptBtnText: { fontSize: 13, fontWeight: '700', color: '#000' },

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

  menuCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuLabel: { fontSize: 15, color: colors.text, fontWeight: '500' },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: colors.primary },
});
