import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { DBUser } from '../../lib/supabase';
import {
  getLeaderboard,
  getFriends,
  getGymLeaderboard,
  searchUsers,
  sendFriendRequest,
  getAllUserFriendships,
  getPendingFriendRequests,
  acceptFriendRequest,
  getProfile,
} from '../../lib/db';
import { DBFriendship } from '../../lib/supabase';

const tabs = ['Global', 'Friends', 'My Gym'] as const;
type Tab = typeof tabs[number];

interface Props {
  userId: string;
}

const RankRow = React.memo(function RankRow({ user, rank, isMe }: { user: DBUser; rank: number; isMe: boolean }) {
  const isTop3 = rank <= 3;
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <View style={[styles.leaderItem, isMe && styles.leaderItemCurrent]}>
      <View style={[styles.rankContainer, isTop3 && { backgroundColor: rankColors[rank - 1] + '33' }]}>
        {rank === 1 ? (
          <Ionicons name="trophy" size={16} color={rankColors[0]} />
        ) : rank === 2 ? (
          <Ionicons name="medal" size={16} color={rankColors[1]} />
        ) : rank === 3 ? (
          <Ionicons name="ribbon" size={16} color={rankColors[2]} />
        ) : (
          <Text style={styles.rankText}>#{rank}</Text>
        )}
      </View>
      <View style={[styles.leaderAvatar, isMe && styles.leaderAvatarCurrent]}>
        <Text style={styles.leaderAvatarText}>{user.avatar}</Text>
      </View>
      <View style={styles.leaderInfo}>
        <View style={styles.leaderNameRow}>
          <Text style={[styles.leaderName, isMe && styles.leaderNameCurrent]}>{user.name}</Text>
          {isMe && (
            <View style={styles.youBadge}>
              <Text style={styles.youBadgeText}>YOU</Text>
            </View>
          )}
        </View>
        <Text style={styles.leaderLevel}>Level {user.level}</Text>
      </View>
      <View style={styles.leaderRight}>
        <Text style={[styles.leaderXP, isMe && { color: colors.xpBar }]}>{user.xp.toLocaleString()}</Text>
        <Text style={styles.leaderXPLabel}>XP</Text>
      </View>
    </View>
  );
});

function EmptyState({ icon, title, subtitle, action }: {
  icon: string; title: string; subtitle: string; action?: React.ReactNode;
}) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon as any} size={56} color={colors.border} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
      {action}
    </View>
  );
}

export default function SocialScreen({ userId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Global');
  const [profile, setProfile] = useState<DBUser | null>(null);
  const [leaderboard, setLeaderboard] = useState<DBUser[]>([]);
  const [friends, setFriends] = useState<DBUser[]>([]);
  const [gymMembers, setGymMembers] = useState<DBUser[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [allFriendships, setAllFriendships] = useState<DBFriendship[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DBUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestSent, setRequestSent] = useState<Record<string, boolean>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [p, lb, fr, reqs, friendships] = await Promise.all([
      getProfile(userId),
      getLeaderboard(),
      getFriends(userId),
      getPendingFriendRequests(userId),
      getAllUserFriendships(userId),
    ]);
    setProfile(p);
    setLeaderboard(lb);
    setFriends(fr);
    setPendingRequests(reqs);
    setAllFriendships(friendships);

    if (p?.gym_id) {
      const gymUsers = await getGymLeaderboard(p.gym_id);
      setGymMembers(gymUsers);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const results = await searchUsers(query.trim(), userId);
    // Annotate with cached friendship status — no extra DB calls
    const withStatus = results.map(u => {
      const match = allFriendships.find(
        f => (f.user_id === userId && f.friend_id === u.id) ||
             (f.friend_id === userId && f.user_id === u.id)
      );
      return { ...u, friendStatus: match?.status ?? 'none' };
    });
    setSearchResults(withStatus as any);
    setSearching(false);
  }, [userId, allFriendships]);

  const handleAddFriend = useCallback(async (targetId: string) => {
    try {
      await sendFriendRequest(userId, targetId);
      setRequestSent(prev => ({ ...prev, [targetId]: true }));
      setAllFriendships(prev => [...prev, { id: '', user_id: userId, friend_id: targetId, status: 'pending', created_at: '' }]);
    } catch {
      setRequestSent(prev => ({ ...prev, [targetId]: true }));
    }
  }, [userId]);

  const handleAccept = useCallback(async (requesterId: string) => {
    await acceptFriendRequest(userId, requesterId);
    await loadAll();
  }, [userId, loadAll]);

  const myRank = useMemo(() => leaderboard.findIndex(u => u.id === userId) + 1, [leaderboard, userId]);

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

        {/* Pending friend requests */}
        {pendingRequests.length > 0 && (
          <View style={styles.requestsCard}>
            <Text style={styles.requestsTitle}>Friend Requests</Text>
            {pendingRequests.map((req: any) => (
              <View key={req.id} style={styles.requestRow}>
                <View style={styles.leaderAvatar}>
                  <Text style={styles.leaderAvatarText}>{req.from?.avatar ?? '?'}</Text>
                </View>
                <Text style={styles.requestName}>{req.from?.name ?? 'Unknown'}</Text>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(req.user_id)}>
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Tab Toggle */}
        <View style={styles.tabContainer}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Global Tab */}
        {activeTab === 'Global' && (
          <>
            {leaderboard.length === 0 ? (
              <EmptyState
                icon="earth-outline"
                title="No rankings yet"
                subtitle="Complete workouts to earn XP and appear on the global leaderboard."
              />
            ) : (
              <>
                {myRank > 0 && (
                  <View style={styles.myRankCard}>
                    <View>
                      <Text style={styles.myRankLabel}>YOUR RANK</Text>
                      <Text style={styles.myRankValue}>#{myRank}</Text>
                    </View>
                    <View style={styles.myRankDivider} />
                    <View>
                      <Text style={styles.myRankLabel}>TOTAL XP</Text>
                      <Text style={[styles.myRankValue, { color: colors.xpBar }]}>{profile?.xp?.toLocaleString() ?? '0'}</Text>
                    </View>
                    <View style={styles.myRankDivider} />
                    <View>
                      <Text style={styles.myRankLabel}>LEVEL</Text>
                      <Text style={[styles.myRankValue, { color: colors.gold }]}>{profile?.level ?? 1}</Text>
                    </View>
                  </View>
                )}
                <View style={styles.leaderboardContainer}>
                  {leaderboard.map((user, i) => (
                    <RankRow key={user.id} user={user} rank={i + 1} isMe={user.id === userId} />
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* Friends Tab */}
        {activeTab === 'Friends' && (
          <>
            <TouchableOpacity style={styles.findFriendsBtn} onPress={() => setShowSearch(true)}>
              <Ionicons name="person-add-outline" size={18} color={colors.text} />
              <Text style={styles.findFriendsBtnText}>Find Friends</Text>
            </TouchableOpacity>
            {friends.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title="No friends yet"
                subtitle="Search for friends to see how you compare on the leaderboard."
              />
            ) : (
              <View style={styles.leaderboardContainer}>
                {friends.map((user, i) => (
                  <RankRow key={user.id} user={user} rank={i + 1} isMe={user.id === userId} />
                ))}
              </View>
            )}
          </>
        )}

        {/* My Gym Tab */}
        {activeTab === 'My Gym' && (
          <>
            {!profile?.gym_id ? (
              <EmptyState
                icon="business-outline"
                title="No gym assigned"
                subtitle="Your coach will add you to a gym. Check back once your coach has set one up."
              />
            ) : gymMembers.length === 0 ? (
              <EmptyState
                icon="barbell-outline"
                title="No gym members yet"
                subtitle="Be the first to earn XP and top the gym leaderboard!"
              />
            ) : (
              <View style={styles.leaderboardContainer}>
                {gymMembers.map((user, i) => (
                  <RankRow key={user.id} user={user} rank={i + 1} isMe={user.id === userId} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Find Friends Modal */}
      <Modal visible={showSearch} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Find Friends</Text>
              <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or email..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={handleSearch}
              autoFocus
            />
            {searching && <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />}
            {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <Text style={styles.noResults}>No users found</Text>
            )}
            <ScrollView>
              {searchResults.map((user: any) => {
                const sent = requestSent[user.id] || user.friendStatus === 'pending';
                const accepted = user.friendStatus === 'accepted';
                return (
                  <View key={user.id} style={styles.searchRow}>
                    <View style={styles.leaderAvatar}>
                      <Text style={styles.leaderAvatarText}>{user.avatar}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.leaderName}>{user.name}</Text>
                      <Text style={styles.leaderLevel}>Level {user.level}</Text>
                    </View>
                    {accepted ? (
                      <View style={styles.friendBadge}>
                        <Text style={styles.friendBadgeText}>Friends</Text>
                      </View>
                    ) : sent ? (
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingBadgeText}>Sent</Text>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.addBtn} onPress={() => handleAddFriend(user.id)}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 20, marginTop: 8 },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.text },

  myRankCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.primary + '66',
    justifyContent: 'space-around',
  },
  myRankLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, marginBottom: 4 },
  myRankValue: { fontSize: 24, fontWeight: '900', color: colors.primary },
  myRankDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },

  leaderboardContainer: { gap: 8 },
  leaderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  leaderItemCurrent: { borderColor: colors.xpBar, backgroundColor: '#0a1f1d' },
  rankContainer: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  leaderAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  leaderAvatarCurrent: { backgroundColor: colors.xpBar + '33', borderWidth: 2, borderColor: colors.xpBar },
  leaderAvatarText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  leaderInfo: { flex: 1 },
  leaderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  leaderName: { fontSize: 15, fontWeight: '700', color: colors.text },
  leaderNameCurrent: { color: colors.xpBar },
  leaderLevel: { fontSize: 12, color: colors.textSecondary },
  youBadge: {
    backgroundColor: colors.xpBar + '33',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  youBadgeText: { fontSize: 9, fontWeight: '800', color: colors.xpBar, letterSpacing: 1 },
  leaderRight: { alignItems: 'flex-end' },
  leaderXP: { fontSize: 17, fontWeight: '800', color: colors.text },
  leaderXPLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textSecondary },
  emptySubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },

  findFriendsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 16,
  },
  findFriendsBtnText: { fontSize: 15, fontWeight: '700', color: colors.text },

  requestsCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.xpBar + '44',
    gap: 12,
  },
  requestsTitle: { fontSize: 14, fontWeight: '700', color: colors.xpBar },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  requestName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  acceptBtn: {
    backgroundColor: colors.xpBar,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
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
  addBtn: {
    backgroundColor: colors.primary,
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  friendBadge: {
    backgroundColor: colors.xpBar + '22',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  friendBadgeText: { fontSize: 12, fontWeight: '700', color: colors.xpBar },
  pendingBadge: {
    backgroundColor: colors.textSecondary + '22',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  pendingBadgeText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
});
