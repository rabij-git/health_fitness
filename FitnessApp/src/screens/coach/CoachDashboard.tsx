import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { getMyTrainees, getProfile, getPrograms, getTraineeHistory, getUnreadMessagesForCoach, markMessageRead } from '../../lib/db';
import { DBUser, DBMessage } from '../../lib/supabase';

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

interface Props {
  onLogout: () => void;
  coachId: string;
  navigation?: { navigate: (screen: string) => void };
}

function TraineePreviewRow({ trainee }: { trainee: DBUser }) {
  return (
    <View style={styles.trainerCard}>
      <View style={styles.trainerAvatar}>
        <Text style={styles.trainerAvatarText}>{trainee.avatar}</Text>
      </View>
      <View style={styles.trainerInfo}>
        <Text style={styles.trainerName}>{trainee.name}</Text>
        <View style={styles.trainerMeta}>
          <Ionicons name="flame" size={12} color={colors.streak} />
          <Text style={styles.trainerMetaText}>{trainee.streak}d streak</Text>
        </View>
      </View>
      <View style={styles.trainerLevel}>
        <Text style={styles.trainerLevelNum}>Lv.{trainee.level}</Text>
      </View>
    </View>
  );
}

export default function CoachDashboard({ onLogout, coachId, navigation }: Props) {
  const [trainees, setTrainees] = useState<DBUser[]>([]);
  const [coachProfile, setCoachProfile] = useState<DBUser | null>(null);
  const [programCount, setProgramCount] = useState(0);
  const [compliance, setCompliance] = useState<number | null>(null);
  const [unreadMessages, setUnreadMessages] = useState<(DBMessage & { fromUser?: DBUser })[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const loadNotifications = useCallback(() => {
    getUnreadMessagesForCoach(coachId).then(setUnreadMessages);
  }, [coachId]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const openNotifications = useCallback(() => {
    setShowNotifications(true);
    unreadMessages.forEach(m => markMessageRead(m.id));
  }, [unreadMessages]);

  const closeNotifications = useCallback(() => {
    setShowNotifications(false);
    setUnreadMessages([]);
  }, []);

  useEffect(() => {
    getProfile(coachId).then(setCoachProfile);
    getPrograms(coachId).then(progs => setProgramCount(progs.length));
    getMyTrainees(coachId).then(async (ts) => {
      setTrainees(ts);
      if (ts.length === 0) {
        setCompliance(null);
        return;
      }
      const histories = await Promise.all(ts.map(t => getTraineeHistory(t.id)));
      const weekAgo = Date.now() - 7 * 86400000;
      const recentSessions = histories.flat().filter(s => new Date(s.completed_at).getTime() >= weekAgo);
      if (recentSessions.length === 0) {
        setCompliance(null);
        return;
      }
      const avg = recentSessions.reduce((sum, s) => sum + (s.completion_pct ?? 0), 0) / recentSessions.length;
      setCompliance(Math.round(avg));
    });
  }, [coachId]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Coach Hub</Text>
            <Text style={styles.subtitle}>Manage your trainees</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.bellBtn} onPress={openNotifications}>
              <Ionicons name="notifications-outline" size={20} color={colors.xpBar} />
              {unreadMessages.length > 0 && <View style={styles.bellDot} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.avatarButton} onPress={onLogout}>
              <Text style={styles.avatarText}>{coachProfile?.avatar ?? 'CO'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.quickStats}>
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatValue}>{trainees.length}</Text>
            <Text style={styles.quickStatLabel}>Trainees</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatValue}>{programCount}</Text>
            <Text style={styles.quickStatLabel}>Programs</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={[styles.quickStatValue, { color: colors.xpBar }]}>
              {compliance === null ? '—' : `${compliance}%`}
            </Text>
            <Text style={styles.quickStatLabel}>Compliance (7d)</Text>
          </View>
        </View>

        {/* Trainee preview */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Your Trainees</Text>
          {navigation && trainees.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('Trainees')}>
              <Text style={styles.viewAllText}>View all</Text>
            </TouchableOpacity>
          )}
        </View>
        {trainees.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>No trainees assigned yet</Text>
            {navigation && (
              <TouchableOpacity style={styles.goToTraineesBtn} onPress={() => navigation.navigate('Trainees')}>
                <Ionicons name="person-add-outline" size={16} color={colors.text} />
                <Text style={styles.goToTraineesBtnText}>Find Trainees</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          trainees.slice(0, 5).map(t => <TraineePreviewRow key={t.id} trainee={t} />)
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.primary} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Notifications Modal */}
      <Modal visible={showNotifications} transparent animationType="slide">
        <View style={styles.notifOverlay}>
          <View style={styles.notifSheet}>
            <View style={styles.notifHeader}>
              <Text style={styles.notifTitle}>Notifications</Text>
              <TouchableOpacity onPress={closeNotifications}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {unreadMessages.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                <Ionicons name="notifications-off-outline" size={32} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary }}>Nothing new</Text>
              </View>
            ) : (
              <ScrollView>
                {unreadMessages.map(msg => (
                  <View key={msg.id} style={styles.notifRow}>
                    <View style={styles.trainerAvatar}>
                      <Text style={styles.trainerAvatarText}>{msg.fromUser?.avatar ?? '?'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notifName}>{msg.fromUser?.name ?? 'Trainee'}</Text>
                      <Text style={styles.notifMessage}>{msg.message}</Text>
                      <Text style={styles.notifTime}>{timeAgo(msg.created_at)}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  greeting: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute', top: 10, right: 11,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.primary, borderWidth: 1.5, borderColor: colors.background,
  },
  notifOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  notifSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '75%',
  },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  notifTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  notifRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  notifName: { fontSize: 14, fontWeight: '700', color: colors.text },
  notifMessage: { fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  notifTime: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
  quickStats: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickStatItem: { flex: 1, alignItems: 'center' },
  quickStatValue: { fontSize: 28, fontWeight: '800', color: colors.text },
  quickStatLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontWeight: '500' },
  quickStatDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  viewAllText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  goToTraineesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  goToTraineesBtnText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  trainerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trainerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  trainerAvatarText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  trainerInfo: { flex: 1 },
  trainerName: { fontSize: 15, fontWeight: '700', color: colors.text },
  trainerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  trainerMetaText: { fontSize: 12, color: colors.textSecondary },
  trainerLevel: {
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  trainerLevelNum: { color: colors.xpBar, fontSize: 13, fontWeight: '700' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    marginTop: 8,
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: colors.primary },
});
