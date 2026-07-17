import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

interface Props {
  onLogout: () => void;
}

export default function AdminSettings({ onLogout }: Props) {
  const [notifications, setNotifications] = React.useState(true);
  const [autoSync, setAutoSync] = React.useState(true);
  const [darkMode, setDarkMode] = React.useState(true);

  const settingGroups = [
    {
      title: 'Platform',
      items: [
        { label: 'Push Notifications', icon: 'notifications', toggle: true, value: notifications, onChange: setNotifications },
        { label: 'Auto Sync', icon: 'sync', toggle: true, value: autoSync, onChange: setAutoSync },
        { label: 'Dark Mode', icon: 'moon', toggle: true, value: darkMode, onChange: setDarkMode },
      ],
    },
    {
      title: 'Integrations',
      items: [
        { label: 'Apple Health API', icon: 'heart', toggle: false },
        { label: 'Garmin Connect API', icon: 'watch', toggle: false },
        { label: 'MyFitnessPal API', icon: 'nutrition', toggle: false },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Admin Profile', icon: 'person', toggle: false },
        { label: 'Security & Privacy', icon: 'shield', toggle: false },
        { label: 'Data Export', icon: 'download', toggle: false },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Settings</Text>

        {settingGroups.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title.toUpperCase()}</Text>
            <View style={styles.groupCard}>
              {group.items.map((item, index) => (
                <View
                  key={item.label}
                  style={[
                    styles.settingItem,
                    index < group.items.length - 1 && styles.settingItemBorder,
                  ]}
                >
                  <View style={styles.settingLeft}>
                    <View style={styles.settingIcon}>
                      <Ionicons name={item.icon as any} size={18} color={colors.primary} />
                    </View>
                    <Text style={styles.settingLabel}>{item.label}</Text>
                  </View>
                  {item.toggle ? (
                    <Switch
                      value={item.value}
                      onValueChange={item.onChange}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor={colors.text}
                    />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.primary} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 24, marginTop: 8 },
  group: { marginBottom: 24 },
  groupTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  groupCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: { fontSize: 15, fontWeight: '500', color: colors.text },
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