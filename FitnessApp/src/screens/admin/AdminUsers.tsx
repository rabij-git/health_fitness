import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { getAllUsers, getCoachInvites, createCoachInvite, revokeCoachInvite } from '../../lib/db';
import { DBUser, DBCoachInvite } from '../../lib/supabase';

interface Props {
  adminId: string;
  onViewAsCoach: (coachId: string) => void;
}

type Filter = 'All' | 'Coaches' | 'Trainees' | 'Admins';

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function AdminUsers({ adminId, onViewAsCoach }: Props) {
  const [users, setUsers] = useState<DBUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');

  const [invites, setInvites] = useState<DBCoachInvite[]>([]);
  const [showInvites, setShowInvites] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [u, inv] = await Promise.all([getAllUsers(), getCoachInvites()]);
    setUsers(u);
    setInvites(inv);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter(u => {
      if (filter === 'Coaches' && u.role !== 'coach') return false;
      if (filter === 'Trainees' && u.role !== 'trainee') return false;
      if (filter === 'Admins' && u.role !== 'admin') return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, filter, searchQuery]);

  const handleGenerateInvite = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const invite = await createCoachInvite(adminId);
      setInvites(prev => [invite, ...prev]);
      Share.share({ message: `You're invited to join FitPro as a coach. Use this invite code when you sign up: ${invite.code}` });
    } catch (e) {
      console.warn('createCoachInvite error', e);
    } finally {
      setGenerating(false);
    }
  }, [adminId, generating]);

  const handleRevoke = useCallback((invite: DBCoachInvite) => {
    Alert.alert('Revoke Invite', `Revoke code "${invite.code}"? It won't be usable to sign up anymore.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: async () => {
        setRevokingId(invite.id);
        try {
          await revokeCoachInvite(invite.id);
          setInvites(prev => prev.filter(i => i.id !== invite.id));
        } catch (e) {
          console.warn('revokeCoachInvite error', e);
        } finally {
          setRevokingId(null);
        }
      } },
    ]);
  }, []);

  const usedByName = useCallback((usedBy: string | null) => {
    if (!usedBy) return null;
    return users.find(u => u.id === usedBy)?.name ?? 'a coach';
  }, [users]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Users</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowInvites(true)}>
            <Ionicons name="add" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search users..."
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
          />
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {(['All', 'Coaches', 'Trainees', 'Admins'] as Filter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, f === filter && styles.filterChipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, f === filter && styles.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionLabel}>
          {filter.toUpperCase()} ({filtered.length})
        </Text>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
            <Ionicons name="people-outline" size={36} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary }}>No users found</Text>
          </View>
        ) : (
          filtered.map((u) => (
            <View key={u.id} style={styles.userCard}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{u.avatar}</Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{u.name}</Text>
                <Text style={styles.userMeta}>{u.email}</Text>
                {u.role === 'trainee' && (
                  <View style={styles.userStats}>
                    <View style={styles.miniStat}>
                      <Ionicons name="flame" size={12} color={colors.streak} />
                      <Text style={styles.miniStatText}>{u.streak}d</Text>
                    </View>
                    <View style={styles.miniStat}>
                      <Ionicons name="star" size={12} color={colors.gold} />
                      <Text style={styles.miniStatText}>Lv.{u.level}</Text>
                    </View>
                  </View>
                )}
              </View>
              <View style={styles.userRight}>
                <View style={[
                  styles.roleBadge,
                  u.role === 'admin' && styles.roleBadgeAdmin,
                  u.role === 'coach' && styles.roleBadgeCoach,
                ]}>
                  <Text style={[
                    styles.roleBadgeText,
                    u.role === 'admin' && styles.roleBadgeTextAdmin,
                    u.role === 'coach' && styles.roleBadgeTextCoach,
                  ]}>
                    {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                  </Text>
                </View>
                {u.role === 'coach' && (
                  <TouchableOpacity style={styles.viewAsBtn} onPress={() => onViewAsCoach(u.id)}>
                    <Ionicons name="log-in-outline" size={13} color={colors.xpBar} />
                    <Text style={styles.viewAsBtnText}>Login as</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Coach Invites Modal ── */}
      <Modal visible={showInvites} transparent animationType="slide" onRequestClose={() => setShowInvites(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Coach Invites</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setShowInvites(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              A trainee can't sign up as a coach without one of these codes.
            </Text>

            <TouchableOpacity
              style={[styles.generateBtn, generating && { opacity: 0.6 }]}
              onPress={handleGenerateInvite}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <>
                  <Ionicons name="key-outline" size={18} color={colors.text} />
                  <Text style={styles.generateBtnText}>Generate New Code</Text>
                </>
              )}
            </TouchableOpacity>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 4 }}>
              {invites.length === 0 ? (
                <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 }}>
                  No invite codes yet.
                </Text>
              ) : (
                invites.map(inv => {
                  const usedName = usedByName(inv.used_by);
                  return (
                    <View key={inv.id} style={styles.inviteRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inviteCode}>{inv.code}</Text>
                        <Text style={styles.inviteMeta}>
                          {usedName ? `Used by ${usedName}` : 'Pending'} · {timeAgo(inv.created_at)}
                        </Text>
                      </View>
                      {!inv.used_by && (
                        <>
                          <TouchableOpacity
                            style={styles.inviteIconBtn}
                            onPress={() => Share.share({ message: `You're invited to join FitPro as a coach. Use this invite code when you sign up: ${inv.code}` })}
                          >
                            <Ionicons name="share-outline" size={18} color={colors.xpBar} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.inviteIconBtn}
                            onPress={() => handleRevoke(inv)}
                            disabled={revokingId === inv.id}
                          >
                            {revokingId === inv.id ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <Ionicons name="trash-outline" size={18} color={colors.primary} />
                            )}
                          </TouchableOpacity>
                        </>
                      )}
                      {!!inv.used_by && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                      )}
                    </View>
                  );
                })
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FF8C00',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, padding: 0 },
  filterRow: { marginBottom: 24 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: colors.text },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '700', color: colors.text },
  userMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  userStats: { flexDirection: 'row', gap: 12, marginTop: 6 },
  miniStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniStatText: { fontSize: 12, color: colors.textSecondary },
  userRight: { alignItems: 'flex-end', gap: 8 },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.success + '22',
  },
  roleBadgeText: { fontSize: 11, color: colors.success, fontWeight: '700' },
  roleBadgeCoach: { backgroundColor: colors.xpBar + '22' },
  roleBadgeTextCoach: { color: colors.xpBar },
  roleBadgeAdmin: { backgroundColor: colors.primary + '22' },
  viewAsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    borderWidth: 1, borderColor: colors.xpBar + '55',
  },
  viewAsBtnText: { fontSize: 11, fontWeight: '700', color: colors.xpBar },
  roleBadgeTextAdmin: { color: colors.primary },

  // ── Invites modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 28,
    borderTopRightRadius: 28, padding: 24, maxHeight: '80%', minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 8,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  modalSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center',
  },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, marginBottom: 16,
  },
  generateBtnText: { fontSize: 14, fontWeight: '700', color: colors.text },
  inviteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.secondary, borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  inviteCode: { fontSize: 16, fontWeight: '800', color: colors.text, letterSpacing: 1.5 },
  inviteMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  inviteIconBtn: { padding: 6 },
});
