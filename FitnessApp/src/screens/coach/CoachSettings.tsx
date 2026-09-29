import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Alert } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { getProfile, deleteOwnAccount } from '../../lib/db';
import { DBUser } from '../../lib/supabase';
import appJson from '../../../app.json';

type InfoKey = 'privacy' | 'help' | 'about';

const INFO_CONTENT: Record<InfoKey, { title: string; body: string }> = {
  privacy: {
    title: 'Privacy',
    body: 'Your workout, weight, and message data is stored securely in the cloud and is only meant to be seen by you and the trainees you coach.',
  },
  help: {
    title: 'Help & Support',
    body: 'Need help? Message a trainee directly from their profile in the Trainees tab, or reach out to your gym administrator for account issues.',
  },
  about: {
    title: 'About Athera',
    body: `${appJson.expo.name} v${appJson.expo.version}\n\nA training and gamification app connecting coaches and trainees.`,
  },
};

interface Props {
  onLogout: () => void;
  coachId: string;
  navigation?: { navigate: (screen: string) => void };
}

export default function CoachSettings({ onLogout, coachId, navigation }: Props) {
  const [profile, setProfile] = useState<DBUser | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [infoModal, setInfoModal] = useState<InfoKey | null>(null);

  useFocusEffect(useCallback(() => {
    getProfile(coachId).then(setProfile);
  }, [coachId]));

  // Required by both app stores for any app with in-app account creation
  // (App Store Guideline 5.1.1(v); Google Play's Data Safety policy) —
  // mirrors ProfileScreen.tsx's trainee-side version, real double-confirm
  // since this is destructive and irreversible. deleteOwnAccount() (db.ts)
  // only throws if the delete itself failed; a failed local sign-out
  // afterward is swallowed there, so reaching the success path here
  // reliably means the account is really gone.
  const [deletingAccount, setDeletingAccount] = useState(false);
  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your coach account and its data — programs, nutrition templates, and messages. Any trainees you coach are disconnected, not deleted; their own accounts and history are unaffected. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Your account will be deleted immediately and cannot be recovered.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    setDeletingAccount(true);
                    try {
                      await deleteOwnAccount();
                      onLogout();
                    } catch (e) {
                      Alert.alert('Error', e instanceof Error ? e.message : 'Could not delete your account. Please try again.');
                      setDeletingAccount(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [onLogout]);

  const items: { label: string; icon: string; onPress: () => void }[] = [
    { label: 'Profile', icon: 'person', onPress: () => setShowProfile(true) },
    { label: 'Notifications', icon: 'notifications', onPress: () => navigation?.navigate('Dashboard') },
    { label: 'Privacy', icon: 'lock-closed', onPress: () => setInfoModal('privacy') },
    { label: 'Help & Support', icon: 'help-circle', onPress: () => setInfoModal('help') },
    { label: 'About Athera', icon: 'information-circle', onPress: () => setInfoModal('about') },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Settings</Text>

        <TouchableOpacity style={styles.profileCard} onPress={() => setShowProfile(true)} activeOpacity={0.8}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{profile?.avatar ?? '..'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{profile?.name ?? 'Loading...'}</Text>
            <Text style={styles.profileRole}>Coach{profile?.email ? ` • ${profile.email}` : ''}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.menuCard}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuItem, index < items.length - 1 && styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={item.onPress}
            >
              <View style={styles.menuLeft}>
                <View style={styles.menuIcon}>
                  <Ionicons name={item.icon as any} size={18} color={colors.primary} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.primary} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.deleteAccountButton, deletingAccount && { opacity: 0.6 }]}
          onPress={handleDeleteAccount}
          disabled={deletingAccount}
        >
          {deletingAccount ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={styles.deleteAccountButtonText}>Delete Account</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Profile Modal */}
      <Modal visible={showProfile} transparent animationType="slide" onRequestClose={() => setShowProfile(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Your Profile</Text>
              <TouchableOpacity onPress={() => setShowProfile(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.profileDetailRow}>
              <View style={[styles.profileAvatar, { width: 64, height: 64, borderRadius: 32 }]}>
                <Text style={[styles.profileAvatarText, { fontSize: 22 }]}>{profile?.avatar ?? '..'}</Text>
              </View>
              <View>
                <Text style={styles.profileName}>{profile?.name ?? '—'}</Text>
                <Text style={styles.profileRole}>Coach</Text>
              </View>
            </View>
            <View style={styles.detailField}>
              <Text style={styles.detailLabel}>EMAIL</Text>
              <Text style={styles.detailValue}>{profile?.email ?? '—'}</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Info Modal (Privacy / Help / About) */}
      <Modal visible={!!infoModal} transparent animationType="slide" onRequestClose={() => setInfoModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{infoModal ? INFO_CONTENT[infoModal].title : ''}</Text>
              <TouchableOpacity onPress={() => setInfoModal(null)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.infoBody}>{infoModal ? INFO_CONTENT[infoModal].body : ''}</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 24, marginTop: 8 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: { color: colors.xpBar, fontSize: 18, fontWeight: '800' },
  profileName: { fontSize: 18, fontWeight: '700', color: colors.text },
  profileRole: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
  menuCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { fontSize: 15, fontWeight: '500', color: colors.text },
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
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 10,
  },
  deleteAccountButtonText: { fontSize: 14, fontWeight: '600', color: colors.danger },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  profileDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  detailField: { marginBottom: 4 },
  detailLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, marginBottom: 6 },
  detailValue: { fontSize: 15, color: colors.text },
  infoBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 21, paddingBottom: 8 },
});
