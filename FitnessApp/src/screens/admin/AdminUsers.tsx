import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { mockTrainers } from '../../data/mockData';

export default function AdminUsers() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Users</Text>
          <TouchableOpacity style={styles.addButton}>
            <Ionicons name="add" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <Text style={styles.searchPlaceholder}>Search users...</Text>
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {['All', 'Trainers', 'Coaches', 'Admins', 'Active', 'Inactive'].map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, f === 'All' && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, f === 'All' && styles.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionLabel}>TRAINERS ({mockTrainers.length})</Text>

        {mockTrainers.map((trainer) => (
          <TouchableOpacity key={trainer.id} style={styles.userCard} activeOpacity={0.8}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{trainer.avatar}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{trainer.name}</Text>
              <Text style={styles.userMeta}>
                Level {trainer.level} • {trainer.program}
              </Text>
              <View style={styles.userStats}>
                <View style={styles.miniStat}>
                  <Ionicons name="flame" size={12} color={colors.streak} />
                  <Text style={styles.miniStatText}>{trainer.streak}d</Text>
                </View>
                <View style={styles.miniStat}>
                  <Ionicons name="star" size={12} color={colors.gold} />
                  <Text style={styles.miniStatText}>{trainer.xp.toLocaleString()} XP</Text>
                </View>
              </View>
            </View>
            <View style={styles.userRight}>
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>Active</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  searchPlaceholder: { color: colors.textSecondary, fontSize: 15 },
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
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success + '22',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  activeText: { fontSize: 11, color: colors.success, fontWeight: '600' },
});