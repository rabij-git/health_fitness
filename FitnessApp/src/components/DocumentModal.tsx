import React from 'react';
import { View, Modal, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export interface DocSection {
  heading: string;
  body: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  sections: DocSection[];
}

// Full-text reader for content that's too long for the small bottom-sheet
// info modals used elsewhere in Settings (About, etc.) — Privacy Policy and
// Help & Support both need real scrollable, sectioned content, not a
// two-line blurb. Rendered natively (not a WebView pointed at the published
// Artifact version of this content) specifically so it works with no
// network call and no dependency on the viewer having a Claude account —
// the hosted Artifact versions exist only for the App Store/Play Console
// submission forms, which require a public URL; the app itself no longer
// relies on that URL being reachable.
export default function DocumentModal({ visible, onClose, title, subtitle, sections }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            {sections.map((s, i) => (
              <View key={i} style={i > 0 ? styles.sectionSpacing : undefined}>
                <Text style={styles.sectionHeading}>{s.heading}</Text>
                <Text style={styles.sectionBody}>{s.body}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sheet: { flex: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 18,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, flex: 1, marginRight: 12 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 20 },
  sectionSpacing: { marginTop: 24 },
  sectionHeading: { fontSize: 15, fontWeight: '700', color: colors.xpBar, marginBottom: 8 },
  sectionBody: { fontSize: 14.5, color: colors.text, lineHeight: 22 },
});
