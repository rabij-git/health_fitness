import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { getAllUsers } from '../../lib/db';

interface Props {
  onLogout: () => void;
  onSwitchToCoach: () => void;
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <View style={[styles.statIconContainer, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function AdminDashboard({ onLogout, onSwitchToCoach }: Props) {
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [coachCount, setCoachCount] = useState(0);
  const [traineeCount, setTraineeCount] = useState(0);

  const load = useCallback(async () => {
    const users = await getAllUsers();
    setTotalUsers(users.length);
    setCoachCount(users.filter(u => u.role === 'coach').length);
    setTraineeCount(users.filter(u => u.role === 'trainee').length);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Admin Control</Text>
            <Text style={styles.subtitle}>Platform Overview</Text>
          </View>
          <TouchableOpacity style={styles.avatarButton} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Stats Grid */}
        <Text style={styles.sectionTitle}>Platform Stats</Text>
        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: 'center', marginBottom: 28 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <StatCard label="Total Users" value={totalUsers} icon="people" color={colors.primary} />
            <StatCard label="Coaches" value={coachCount} icon="person-circle" color={colors.xpBar} />
            <StatCard label="Trainees" value={traineeCount} icon="barbell" color={colors.gold} />
          </View>
        )}

        <TouchableOpacity style={styles.switchCoachBtn} onPress={onSwitchToCoach} activeOpacity={0.85}>
          <Ionicons name="swap-horizontal" size={18} color={colors.text} />
          <Text style={styles.switchCoachBtnText}>Switch to Coach View</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 8,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderTopWidth: 3,
    alignItems: 'center',
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  switchCoachBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.xpBar, borderRadius: 14, paddingVertical: 16,
  },
  switchCoachBtnText: { fontSize: 15, fontWeight: '700', color: colors.text },
});
