import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { mockMedals, getXpForNextLevel, getCurrentLevelXp } from '../../data/mockData';
import { getProfile } from '../../lib/db';
import { DBUser } from '../../lib/supabase';

const MedalCard = React.memo(function MedalCard({ medal }: { medal: typeof mockMedals[0] }) {
  const rarityColors = {
    common: colors.textSecondary,
    rare: '#4A9EFF',
    ultra_rare: colors.gold,
  };

  const rarityLabels = {
    common: 'Common',
    rare: 'Rare',
    ultra_rare: 'Ultra Rare',
  };

  const iconMap: Record<string, any> = {
    fitness: 'fitness',
    flame: 'flame',
    trophy: 'trophy',
    medal: 'medal',
    star: 'star',
    sunny: 'sunny',
    rocket: 'rocket',
  };

  const iconColor = medal.earned ? rarityColors[medal.rarity] : colors.border;

  return (
    <View style={[styles.medalCard, !medal.earned && styles.medalCardUnearned]}>
      <View style={[
        styles.medalIconContainer,
        { borderColor: medal.earned ? rarityColors[medal.rarity] : colors.border },
        medal.earned && { backgroundColor: rarityColors[medal.rarity] + '22' },
      ]}>
        <Ionicons
          name={iconMap[medal.icon]}
          size={28}
          color={iconColor}
        />
        {medal.earned && (
          <View style={styles.earnedBadge}>
            <Ionicons name="checkmark" size={10} color={colors.text} />
          </View>
        )}
      </View>
      <Text style={[styles.medalName, !medal.earned && styles.textDimmed]}>
        {medal.name}
      </Text>
      <View style={[styles.rarityTag, { backgroundColor: rarityColors[medal.rarity] + '22' }]}>
        <Text style={[styles.rarityText, { color: rarityColors[medal.rarity] }]}>
          {rarityLabels[medal.rarity]}
        </Text>
      </View>
      <Text style={[styles.medalXP, !medal.earned && styles.textDimmed]}>
        +{medal.xpReward} XP
      </Text>
    </View>
  );
});

export default function GamificationScreen({ userId }: { userId?: string }) {
  const [profile, setProfile] = useState<DBUser | null>(null);

  useEffect(() => {
    if (userId) getProfile(userId).then(setProfile);
  }, [userId]);

  const user = profile
    ? { name: profile.name, avatar: profile.avatar, level: profile.level, xp: profile.xp, streak: profile.streak }
    : { name: '...', avatar: '?', level: 1, xp: 0, streak: 0 };

  const xpForNext = getXpForNextLevel(user.level);
  const currentLevelXp = getCurrentLevelXp(user.xp);
  const xpProgress = currentLevelXp / xpForNext;

  const medals = mockMedals;
  const earnedMedals = medals.filter((m) => m.earned).length;
  const isNewUser = user.xp === 0 && user.streak === 0;

  if (isNewUser) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Achievements</Text>
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={64} color={colors.border} />
            <Text style={styles.emptyTitle}>No achievements yet</Text>
            <Text style={styles.emptySubtitle}>Complete workouts and hit streaks to earn medals and XP.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Achievements</Text>

        {/* XP Progress Card */}
        <View style={styles.xpCard}>
          <View style={styles.xpCardTop}>
            <View style={styles.levelCircle}>
              <Text style={styles.levelCircleNum}>{user.level}</Text>
              <Text style={styles.levelCircleLabel}>LVL</Text>
            </View>
            <View style={styles.xpCardInfo}>
              <Text style={styles.xpCardName}>{user.name}</Text>
              <Text style={styles.xpCardTitle}>
                {user.level >= 20 ? 'Elite Athlete' : user.level >= 10 ? 'Consistent Athlete' : user.level >= 5 ? 'Rising Star' : 'New Adventurer'}
              </Text>
              <Text style={styles.xpTotal}>{user.xp.toLocaleString()} Total XP</Text>
            </View>
          </View>

          <View style={styles.xpProgressSection}>
            <View style={styles.xpProgressLabels}>
              <Text style={styles.xpProgressLabel}>
                {currentLevelXp} / {xpForNext} XP
              </Text>
              <Text style={styles.xpProgressNext}>
                Level {user.level + 1} in {xpForNext - currentLevelXp} XP
              </Text>
            </View>
            <View style={styles.xpBg}>
              <View style={[styles.xpFill, { width: `${xpProgress * 100}%` as any }]} />
            </View>
          </View>
        </View>

        {/* Streak Section */}
        <View style={styles.streakCard}>
          <View style={styles.streakHeader}>
            <Ionicons name="flame" size={24} color={colors.streak} />
            <Text style={styles.streakTitle}>{user.streak}-Day Streak</Text>
            <Ionicons name="flame" size={24} color={colors.streak} />
          </View>
          <Text style={styles.streakSub}>Keep it up! You're on fire.</Text>

          {/* Week view */}
          <View style={styles.weekRow}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
              const isActive = i < (user.streak % 7 || 7);
              return (
                <View key={day} style={styles.dayItem}>
                  <View style={[styles.dayCircle, isActive && styles.dayCircleActive]}>
                    <Ionicons
                      name="flame"
                      size={16}
                      color={isActive ? colors.streak : colors.border}
                    />
                  </View>
                  <Text style={[styles.dayLabel, isActive && styles.dayLabelActive]}>
                    {day}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Streak milestones */}
          <View style={styles.milestonesRow}>
            {[7, 14, 30, 60, 100].map((milestone) => (
              <View
                key={milestone}
                style={[
                  styles.milestone,
                  user.streak >= milestone && styles.milestoneReached,
                ]}
              >
                <Text style={[
                  styles.milestoneText,
                  user.streak >= milestone && styles.milestoneTextReached,
                ]}>
                  {milestone}d
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Medals Grid */}
        <View style={styles.medalsHeader}>
          <Text style={styles.medalsTitle}>Medal Collection</Text>
          <View style={styles.medalCount}>
            <Text style={styles.medalCountText}>
              {earnedMedals}/{mockMedals.length}
            </Text>
          </View>
        </View>

        <View style={styles.medalsGrid}>
          {medals.map((medal) => (
            <MedalCard key={medal.id} medal={medal} />
          ))}
        </View>

        {/* Stats summary */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{earnedMedals}</Text>
            <Text style={styles.statLabel}>Medals Earned</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: colors.xpBar }]}>
              {user.xp.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Total XP</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: colors.streak }]}>
              {user.streak}
            </Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 20, marginTop: 8 },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 16,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textSecondary },
  emptySubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 24 },

  // XP Card
  xpCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  xpCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 16 },
  levelCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary + '22',
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelCircleNum: { fontSize: 24, fontWeight: '900', color: colors.primary },
  levelCircleLabel: { fontSize: 9, fontWeight: '800', color: colors.primary, letterSpacing: 1 },
  xpCardInfo: { flex: 1 },
  xpCardName: { fontSize: 18, fontWeight: '700', color: colors.text },
  xpCardTitle: { fontSize: 13, color: colors.xpBar, marginTop: 3, fontWeight: '600' },
  xpTotal: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  xpProgressSection: {},
  xpProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  xpProgressLabel: { fontSize: 13, color: colors.xpBar, fontWeight: '600' },
  xpProgressNext: { fontSize: 12, color: colors.textSecondary },
  xpBg: { height: 12, backgroundColor: colors.secondary, borderRadius: 6, overflow: 'hidden' },
  xpFill: { height: '100%', backgroundColor: colors.xpBar, borderRadius: 6 },

  // Streak
  streakCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.streak + '44',
  },
  streakHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  streakTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.streak },
  streakSub: { fontSize: 13, color: colors.textSecondary, marginBottom: 20 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  dayItem: { alignItems: 'center', gap: 6 },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleActive: { backgroundColor: colors.streak + '22' },
  dayLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
  dayLabelActive: { color: colors.streak },
  milestonesRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  milestone: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.secondary,
    alignItems: 'center',
  },
  milestoneReached: { backgroundColor: colors.streak + '33' },
  milestoneText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  milestoneTextReached: { color: colors.streak },

  // Medals
  medalsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  medalsTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  medalCount: {
    backgroundColor: colors.primary + '33',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  medalCountText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  medalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  medalCard: {
    width: '47%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  medalCardUnearned: { opacity: 0.5 },
  medalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  earnedBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalName: { fontSize: 13, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 6 },
  textDimmed: { color: colors.textSecondary },
  rarityTag: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 6,
  },
  rarityText: { fontSize: 10, fontWeight: '700' },
  medalXP: { fontSize: 12, color: colors.xpBar, fontWeight: '700' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 4, fontWeight: '500' },
});