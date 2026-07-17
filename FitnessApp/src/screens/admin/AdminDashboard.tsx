import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { mockAdminStats, mockSyncLogs, SyncLog } from '../../data/mockData';

interface Props {
  onLogout: () => void;
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

function SyncLogItem({ log }: { log: SyncLog }) {
  const statusColors = {
    success: colors.success,
    error: colors.primary,
    pending: colors.warning,
  };
  const statusIcons = {
    success: 'checkmark-circle',
    error: 'close-circle',
    pending: 'time',
  };

  return (
    <View style={styles.logItem}>
      <View style={[styles.logIcon, { backgroundColor: statusColors[log.status] + '22' }]}>
        <Ionicons name={statusIcons[log.status] as any} size={18} color={statusColors[log.status]} />
      </View>
      <View style={styles.logContent}>
        <Text style={styles.logService}>{log.service}</Text>
        <Text style={styles.logTime}>{log.time}</Text>
      </View>
      <View style={styles.logRight}>
        {log.records > 0 && (
          <Text style={styles.logRecords}>{log.records} records</Text>
        )}
        <View style={[styles.statusBadge, { backgroundColor: statusColors[log.status] + '33' }]}>
          <Text style={[styles.statusText, { color: statusColors[log.status] }]}>
            {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function AdminDashboard({ onLogout }: Props) {
  const [syncing, setSyncing] = useState<string | null>(null);

  const handleSync = (service: string) => {
    setSyncing(service);
    setTimeout(() => setSyncing(null), 2000);
  };

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
            <Ionicons name="person" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Stats Grid */}
        <Text style={styles.sectionTitle}>Platform Stats</Text>
        <View style={styles.statsGrid}>
          <StatCard
            label="Total Users"
            value={mockAdminStats.totalUsers}
            icon="people"
            color={colors.primary}
          />
          <StatCard
            label="Active Trainers"
            value={mockAdminStats.activeTrainers}
            icon="barbell"
            color={colors.xpBar}
          />
          <StatCard
            label="Synced Today"
            value={mockAdminStats.syncedToday}
            icon="sync"
            color={colors.gold}
          />
        </View>

        {/* Sync Buttons */}
        <Text style={styles.sectionTitle}>Health Integrations</Text>
        <View style={styles.syncButtons}>
          <TouchableOpacity
            style={[styles.syncButton, { borderColor: '#FF3B30' }]}
            onPress={() => handleSync('apple')}
            activeOpacity={0.8}
          >
            <Ionicons name="heart" size={22} color="#FF3B30" />
            <View style={styles.syncButtonText}>
              <Text style={styles.syncButtonLabel}>Apple Health</Text>
              <Text style={styles.syncButtonSub}>
                {syncing === 'apple' ? 'Syncing...' : 'Last: 10 min ago'}
              </Text>
            </View>
            <Ionicons
              name={syncing === 'apple' ? 'sync' : 'chevron-forward'}
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.syncButton, { borderColor: '#007AFF' }]}
            onPress={() => handleSync('garmin')}
            activeOpacity={0.8}
          >
            <Ionicons name="watch" size={22} color="#007AFF" />
            <View style={styles.syncButtonText}>
              <Text style={styles.syncButtonLabel}>Garmin Connect</Text>
              <Text style={styles.syncButtonSub}>
                {syncing === 'garmin' ? 'Syncing...' : 'Last: 1 hour ago'}
              </Text>
            </View>
            <Ionicons
              name={syncing === 'garmin' ? 'sync' : 'chevron-forward'}
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.syncButton, { borderColor: '#34C759' }]}
            onPress={() => handleSync('myfitnesspal')}
            activeOpacity={0.8}
          >
            <Ionicons name="nutrition" size={22} color="#34C759" />
            <View style={styles.syncButtonText}>
              <Text style={styles.syncButtonLabel}>MyFitnessPal</Text>
              <Text style={styles.syncButtonSub}>
                {syncing === 'myfitnesspal' ? 'Syncing...' : 'Error — Tap to retry'}
              </Text>
            </View>
            <Ionicons
              name={syncing === 'myfitnesspal' ? 'sync' : 'chevron-forward'}
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Sync Log */}
        <Text style={styles.sectionTitle}>Recent Sync Log</Text>
        <View style={styles.logContainer}>
          {mockSyncLogs.map((log) => (
            <SyncLogItem key={log.id} log={log} />
          ))}
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.primary} />
          <Text style={styles.logoutText}>Logout</Text>
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
  syncButtons: {
    gap: 12,
    marginBottom: 28,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    gap: 14,
  },
  syncButtonText: {
    flex: 1,
  },
  syncButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  syncButtonSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  logContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 28,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 14,
  },
  logIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logContent: {
    flex: 1,
  },
  logService: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  logTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  logRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  logRecords: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
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
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
});