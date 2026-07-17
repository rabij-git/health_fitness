import React, { useState, useEffect } from 'react';
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
import { getMyTrainees, getProfile, getPrograms } from '../../lib/db';
import { DBUser, DBProgram } from '../../lib/supabase';

interface Props {
  onLogout: () => void;
  coachId: string;
}

interface Trainer {
  id: string;
  avatar: string;
  name: string;
  program: string;
  lastActive: string;
  level: number;
  progress: number;
  streak: number;
  xp: number;
}

function TrainerCard({ trainer, onAssign }: { trainer: Trainer; onAssign: () => void }) {
  return (
    <View style={styles.trainerCard}>
      <View style={styles.trainerHeader}>
        <View style={styles.trainerAvatar}>
          <Text style={styles.trainerAvatarText}>{trainer.avatar}</Text>
        </View>
        <View style={styles.trainerInfo}>
          <Text style={styles.trainerName}>{trainer.name}</Text>
          <Text style={styles.trainerProgram}>{trainer.program}</Text>
          <View style={styles.trainerMeta}>
            <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.trainerMetaText}>Active {trainer.lastActive}</Text>
          </View>
        </View>
        <View style={styles.trainerLevel}>
          <Text style={styles.trainerLevelNum}>Lv.{trainer.level}</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressLabelRow}>
          <Text style={styles.progressLabel}>Program Progress</Text>
          <Text style={styles.progressPercent}>{trainer.progress}%</Text>
        </View>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${trainer.progress}%` as any }]} />
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.trainerStats}>
        <View style={styles.trainerStat}>
          <Ionicons name="flame" size={14} color={colors.streak} />
          <Text style={styles.trainerStatText}>{trainer.streak}d streak</Text>
        </View>
        <View style={styles.trainerStat}>
          <Ionicons name="star" size={14} color={colors.gold} />
          <Text style={styles.trainerStatText}>{trainer.xp.toLocaleString()} XP</Text>
        </View>
        <TouchableOpacity style={styles.assignBtn} onPress={onAssign}>
          <Text style={styles.assignBtnText}>Assign Program</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ProgramModal({
  visible,
  onClose,
  onSelect,
  programs,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (program: DBProgram) => void;
  programs: DBProgram[];
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Assign Program</Text>
          <Text style={styles.modalSubtitle}>Select a training program to assign</Text>

          {programs.length === 0 && (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 }}>
              No programs yet — create one in the Programs tab.
            </Text>
          )}

          {programs.map((program) => (
            <TouchableOpacity
              key={program.id}
              style={styles.programOption}
              onPress={() => onSelect(program)}
              activeOpacity={0.8}
            >
              <View style={styles.programIcon}>
                <Ionicons name="barbell" size={20} color={colors.primary} />
              </View>
              <View style={styles.programInfo}>
                <Text style={styles.programName}>{program.name}</Text>
                <Text style={styles.programDesc}>{program.description}</Text>
                <View style={styles.programMeta}>
                  <View style={styles.metaBadge}>
                    <Text style={styles.metaBadgeText}>{program.duration}</Text>
                  </View>
                  <View style={[styles.metaBadge, { backgroundColor: colors.accent + '44' }]}>
                    <Text style={[styles.metaBadgeText, { color: colors.xpBar }]}>
                      {program.difficulty}
                    </Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.modalClose} onPress={onClose}>
            <Text style={styles.modalCloseText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function CoachDashboard({ onLogout, coachId }: Props) {
  const [trainees, setTrainees] = useState<DBUser[]>([]);
  const [coachProfile, setCoachProfile] = useState<DBUser | null>(null);
  const [programs, setPrograms] = useState<DBProgram[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTrainer, setSelectedTrainer] = useState<string | null>(null);
  const [assignedPrograms, setAssignedPrograms] = useState<Record<string, string>>({});

  useEffect(() => {
    getProfile(coachId).then(setCoachProfile);
    getMyTrainees(coachId).then(setTrainees);
    getPrograms(coachId).then(setPrograms);
  }, [coachId]);

  const handleAssign = (trainerId: string) => {
    setSelectedTrainer(trainerId);
    setModalVisible(true);
  };

  const handleProgramSelect = (program: DBProgram) => {
    if (selectedTrainer) {
      setAssignedPrograms((prev) => ({ ...prev, [selectedTrainer]: program.name }));
    }
    setModalVisible(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Coach Hub</Text>
            <Text style={styles.subtitle}>Manage your trainees</Text>
          </View>
          <TouchableOpacity style={styles.avatarButton} onPress={onLogout}>
            <Text style={styles.avatarText}>{coachProfile?.avatar ?? 'CO'}</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Stats */}
        <View style={styles.quickStats}>
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatValue}>{trainees.length}</Text>
            <Text style={styles.quickStatLabel}>Trainees</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatValue}>3</Text>
            <Text style={styles.quickStatLabel}>Programs</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={[styles.quickStatValue, { color: colors.xpBar }]}>92%</Text>
            <Text style={styles.quickStatLabel}>Compliance</Text>
          </View>
        </View>

        {/* Trainer Cards */}
        <Text style={styles.sectionTitle}>Your Trainees</Text>
        {trainees.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>No trainees assigned yet</Text>
          </View>
        )}
        {trainees.map((t) => {
          const trainer: Trainer = {
            id: t.id,
            avatar: t.avatar,
            name: t.name,
            program: assignedPrograms[t.id] ?? 'No program assigned',
            lastActive: 'recently',
            level: t.level,
            progress: 0,
            streak: t.streak,
            xp: t.xp,
          };
          return (
            <TrainerCard
              key={t.id}
              trainer={trainer}
              onAssign={() => handleAssign(t.id)}
            />
          );
        })}

        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.primary} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      <ProgramModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSelect={handleProgramSelect}
        programs={programs}
      />
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  trainerCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trainerHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  trainerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  trainerAvatarText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  trainerInfo: { flex: 1 },
  trainerName: { fontSize: 17, fontWeight: '700', color: colors.text },
  trainerProgram: { fontSize: 13, color: colors.primary, marginTop: 3, fontWeight: '600' },
  trainerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  trainerMetaText: { fontSize: 12, color: colors.textSecondary },
  trainerLevel: {
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  trainerLevelNum: { color: colors.xpBar, fontSize: 13, fontWeight: '700' },
  progressSection: { marginBottom: 14 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  progressPercent: { fontSize: 12, color: colors.text, fontWeight: '700' },
  progressBg: {
    height: 6,
    backgroundColor: colors.secondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.xpBar, borderRadius: 3 },
  trainerStats: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  trainerStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  trainerStatText: { fontSize: 12, color: colors.textSecondary },
  assignBtn: {
    marginLeft: 'auto' as any,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  assignBtnText: { color: colors.text, fontSize: 12, fontWeight: '700' },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 24 },
  programOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  programIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  programInfo: { flex: 1 },
  programName: { fontSize: 16, fontWeight: '700', color: colors.text },
  programDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 3, lineHeight: 16 },
  programMeta: { flexDirection: 'row', gap: 8, marginTop: 8 },
  metaBadge: {
    backgroundColor: colors.primary + '33',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  metaBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  modalClose: {
    marginTop: 8,
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalCloseText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
});