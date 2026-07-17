import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { DBUser, DBGym } from '../../lib/supabase';
import {
  getMyTrainees,
  createGym,
  getCoachGym,
  addToGym,
  removeFromGym,
  searchUsers,
} from '../../lib/db';

interface Props {
  coachId: string;
}

export default function CoachRankings({ coachId }: Props) {
  const [trainees, setTrainees] = useState<DBUser[]>([]);
  const [gym, setGym] = useState<DBGym | null>(null);
  const [gymMembers, setGymMembers] = useState<DBUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreateGym, setShowCreateGym] = useState(false);
  const [gymName, setGymName] = useState('');
  const [creating, setCreating] = useState(false);

  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DBUser[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadData();
  }, [coachId]);

  async function loadData() {
    setLoading(true);
    const [myTrainees, myGym] = await Promise.all([
      getMyTrainees(coachId),
      getCoachGym(coachId),
    ]);
    setTrainees(myTrainees);
    setGym(myGym);
    if (myGym) {
      const members = myTrainees.filter(t => t.gym_id === myGym.id);
      setGymMembers(members);
    }
    setLoading(false);
  }

  async function handleCreateGym() {
    if (!gymName.trim()) return;
    setCreating(true);
    try {
      const newGym = await createGym(gymName.trim(), coachId);
      setGym(newGym);
      setShowCreateGym(false);
      setGymName('');
    } catch (e) {
      Alert.alert('Error', 'Could not create gym. Try again.');
    }
    setCreating(false);
  }

  async function handleSearch(query: string) {
    setSearchQuery(query);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const results = await searchUsers(query.trim(), coachId);
    setSearchResults(results);
    setSearching(false);
  }

  async function handleAddToGym(user: DBUser) {
    if (!gym) return;
    try {
      await addToGym(user.id, gym.id);
      setGymMembers(prev => [...prev, { ...user, gym_id: gym.id }]);
      setSearchResults(prev => prev.filter(u => u.id !== user.id));
    } catch (e) {
      Alert.alert('Error', 'Could not add user to gym.');
    }
  }

  async function handleRemoveFromGym(userId: string) {
    try {
      await removeFromGym(userId);
      setGymMembers(prev => prev.filter(u => u.id !== userId));
    } catch (e) {
      Alert.alert('Error', 'Could not remove user from gym.');
    }
  }

  const sorted = useMemo(() => [...trainees].sort((a, b) => b.xp - a.xp), [trainees]);

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
        <Text style={styles.title}>Rankings</Text>
        <Text style={styles.subtitle}>Performance leaderboard for your squad</Text>

        {/* My Gym Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Gym</Text>
          {!gym ? (
            <TouchableOpacity style={styles.createGymBtn} onPress={() => setShowCreateGym(true)}>
              <Ionicons name="add" size={16} color={colors.text} />
              <Text style={styles.createGymBtnText}>Create Gym</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.addMemberBtn} onPress={() => setShowAddMember(true)}>
              <Ionicons name="person-add-outline" size={16} color={colors.xpBar} />
              <Text style={styles.addMemberBtnText}>Add Member</Text>
            </TouchableOpacity>
          )}
        </View>

        {!gym ? (
          <View style={styles.emptyCard}>
            <Ionicons name="business-outline" size={36} color={colors.border} />
            <Text style={styles.emptyText}>No gym created yet</Text>
            <Text style={styles.emptySubtext}>Create a gym to group your trainees and track gym-wide rankings.</Text>
          </View>
        ) : (
          <View style={styles.gymCard}>
            <View style={styles.gymHeader}>
              <Ionicons name="business" size={20} color={colors.primary} />
              <Text style={styles.gymName}>{gym.name}</Text>
              <Text style={styles.gymMemberCount}>{gymMembers.length} members</Text>
            </View>
            {gymMembers.length === 0 ? (
              <Text style={styles.emptySubtext}>No members yet. Add trainees to this gym.</Text>
            ) : (
              gymMembers.map((member) => (
                <View key={member.id} style={styles.memberRow}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>{member.avatar}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberLevel}>Level {member.level} · {member.xp.toLocaleString()} XP</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveFromGym(member.id)}>
                    <Ionicons name="remove-circle-outline" size={22} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {/* Trainee Rankings */}
        <Text style={styles.sectionTitle2}>My Trainees</Text>
        {sorted.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={36} color={colors.border} />
            <Text style={styles.emptyText}>No trainees yet</Text>
            <Text style={styles.emptySubtext}>Assign trainees from the Programs tab to see their rankings here.</Text>
          </View>
        ) : (
          sorted.map((trainer, index) => (
            <View
              key={trainer.id}
              style={[styles.rankCard, index === 0 && styles.rankCardFirst]}
            >
              <View style={[styles.rankNum, index === 0 && styles.rankNumFirst]}>
                {index === 0 ? (
                  <Ionicons name="trophy" size={16} color={colors.gold} />
                ) : (
                  <Text style={[styles.rankNumText, index < 3 && styles.rankNumTextTop]}>
                    #{index + 1}
                  </Text>
                )}
              </View>
              <View style={styles.rankAvatar}>
                <Text style={styles.rankAvatarText}>{trainer.avatar}</Text>
              </View>
              <View style={styles.rankInfo}>
                <Text style={styles.rankName}>{trainer.name}</Text>
                <View style={styles.rankStats}>
                  <Ionicons name="flame" size={12} color={colors.streak} />
                  <Text style={styles.rankStatText}>{trainer.streak}d streak</Text>
                </View>
              </View>
              <View style={styles.rankXP}>
                <Text style={[styles.rankXPValue, index === 0 && { color: colors.gold }]}>
                  {trainer.xp.toLocaleString()}
                </Text>
                <Text style={styles.rankXPLabel}>XP</Text>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>Lv.{trainer.level}</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create Gym Modal */}
      <Modal visible={showCreateGym} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Create a Gym</Text>
              <TouchableOpacity onPress={() => setShowCreateGym(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Gym name..."
              placeholderTextColor={colors.textSecondary}
              value={gymName}
              onChangeText={setGymName}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.primaryBtn, (!gymName.trim() || creating) && styles.primaryBtnDisabled]}
              onPress={handleCreateGym}
              disabled={!gymName.trim() || creating}
            >
              {creating
                ? <ActivityIndicator color={colors.text} />
                : <Text style={styles.primaryBtnText}>Create Gym</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Member Modal */}
      <Modal visible={showAddMember} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add to {gym?.name}</Text>
              <TouchableOpacity onPress={() => { setShowAddMember(false); setSearchQuery(''); setSearchResults([]); }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Search trainee by name or email..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={handleSearch}
              autoFocus
            />
            {searching && <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />}
            {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <Text style={styles.noResults}>No users found</Text>
            )}
            <ScrollView>
              {searchResults
                .filter(u => !gymMembers.find(m => m.id === u.id))
                .map((user) => (
                  <View key={user.id} style={styles.searchRow}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>{user.avatar}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{user.name}</Text>
                      <Text style={styles.memberLevel}>Level {user.level}</Text>
                    </View>
                    <TouchableOpacity style={styles.addBtn} onPress={() => handleAddToGym(user)}>
                      <Ionicons name="add" size={18} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                ))
              }
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
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 4, marginTop: 8 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 24 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  sectionTitle2: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 24, marginBottom: 12 },

  createGymBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  createGymBtnText: { fontSize: 13, fontWeight: '700', color: colors.text },
  addMemberBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.xpBar + '22', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  addMemberBtnText: { fontSize: 13, fontWeight: '700', color: colors.xpBar },

  emptyCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 24,
    alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 8,
  },
  emptyText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  emptySubtext: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  gymCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.primary + '44', marginBottom: 8, gap: 12,
  },
  gymHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gymName: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  gymMemberCount: { fontSize: 12, color: colors.textSecondary },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border,
  },
  memberAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  memberName: { fontSize: 14, fontWeight: '600', color: colors.text },
  memberLevel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  rankCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: colors.border, gap: 12,
  },
  rankCardFirst: { borderColor: colors.gold, backgroundColor: '#1a1800' },
  rankNum: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center',
  },
  rankNumFirst: { backgroundColor: colors.gold + '33' },
  rankNumText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  rankNumTextTop: { color: colors.primary },
  rankAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  rankAvatarText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  rankInfo: { flex: 1 },
  rankName: { fontSize: 15, fontWeight: '700', color: colors.text },
  rankStats: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  rankStatText: { fontSize: 12, color: colors.textSecondary },
  rankXP: { alignItems: 'flex-end' },
  rankXPValue: { fontSize: 18, fontWeight: '800', color: colors.xpBar },
  rankXPLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
  levelBadge: {
    marginTop: 4, backgroundColor: colors.accent + '66',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  levelBadgeText: { fontSize: 11, color: colors.xpBar, fontWeight: '700' },

  overlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '75%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  input: {
    backgroundColor: colors.secondary, borderRadius: 12, padding: 14,
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: 12, padding: 16,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.text },
  noResults: { color: colors.textSecondary, textAlign: 'center', marginTop: 12 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  addBtn: {
    backgroundColor: colors.primary, width: 34, height: 34,
    borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
});
