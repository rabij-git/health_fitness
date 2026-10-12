import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { Medal } from '../data/mockData';

// Shared by GamificationScreen.tsx (a trainee's own medal collection) and
// CoachTrainees.tsx (a coach viewing a trainee's medals) — same card grid,
// same tap-to-see-the-full-description modal, so the two don't drift apart.
// `medals` is expected pre-merged with real earned state (each entry's own
// `earned` boolean already set, same convention both screens already used
// before this).

const RARITY_COLORS: Record<Medal['rarity'], string> = {
  common: colors.textSecondary,
  rare: '#4A9EFF',
  ultra_rare: colors.gold,
};
const RARITY_LABELS: Record<Medal['rarity'], string> = {
  common: 'Common',
  rare: 'Rare',
  ultra_rare: 'Ultra Rare',
};

function MedalCard({ medal, onPress }: { medal: Medal; onPress: () => void }) {
  const iconColor = medal.earned ? RARITY_COLORS[medal.rarity] : colors.border;
  return (
    <TouchableOpacity
      style={[styles.medalCard, !medal.earned && styles.medalCardUnearned]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[
        styles.medalIconContainer,
        { borderColor: medal.earned ? RARITY_COLORS[medal.rarity] : colors.border },
        medal.earned && { backgroundColor: RARITY_COLORS[medal.rarity] + '22' },
      ]}>
        {/* `medal.icon` is already a real Ionicons name (e.g. 'hand-left',
            'flame-outline') — passed straight through, no lookup table. An
            earlier version routed this through a small hardcoded `iconMap`
            that only covered ~7 names, so every medal using any other icon
            (the overwhelming majority of the catalog) silently rendered no
            icon at all. */}
        <Ionicons name={medal.icon as any} size={28} color={iconColor} />
        {medal.earned && (
          <View style={styles.earnedBadge}>
            <Ionicons name="checkmark" size={10} color={colors.text} />
          </View>
        )}
      </View>
      <Text style={[styles.medalName, !medal.earned && styles.textDimmed]} numberOfLines={2}>
        {medal.name}
      </Text>
      <View style={[styles.rarityTag, { backgroundColor: RARITY_COLORS[medal.rarity] + '22' }]}>
        <Text style={[styles.rarityText, { color: RARITY_COLORS[medal.rarity] }]}>
          {RARITY_LABELS[medal.rarity]}
        </Text>
      </View>
      <Text style={[styles.medalXP, !medal.earned && styles.textDimmed]}>
        +{medal.xpReward} XP
      </Text>
    </TouchableOpacity>
  );
}

export default function MedalGrid({ medals }: { medals: Medal[] }) {
  const [selected, setSelected] = useState<Medal | null>(null);

  return (
    <>
      <View style={styles.medalsGrid}>
        {medals.map(medal => (
          <MedalCard key={medal.id} medal={medal} onPress={() => setSelected(medal)} />
        ))}
      </View>

      {/* Detail modal — the actual point of this component: tapping a card
          (earned or not) shows its full description, not just name/XP. */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSelected(null)}>
          <TouchableOpacity style={styles.detailSheet} activeOpacity={1} onPress={() => {}}>
            {selected && (
              <>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
                <View style={[
                  styles.detailIconContainer,
                  { borderColor: selected.earned ? RARITY_COLORS[selected.rarity] : colors.border },
                  selected.earned && { backgroundColor: RARITY_COLORS[selected.rarity] + '22' },
                ]}>
                  <Ionicons
                    name={selected.icon as any}
                    size={40}
                    color={selected.earned ? RARITY_COLORS[selected.rarity] : colors.border}
                  />
                </View>
                <Text style={styles.detailName}>{selected.name}</Text>
                <View style={[styles.rarityTag, { backgroundColor: RARITY_COLORS[selected.rarity] + '22', marginTop: 10 }]}>
                  <Text style={[styles.rarityText, { color: RARITY_COLORS[selected.rarity] }]}>
                    {RARITY_LABELS[selected.rarity]}
                  </Text>
                </View>
                <Text style={styles.detailDescription}>{selected.description}</Text>
                <View style={styles.detailFooterRow}>
                  <Text style={styles.detailXp}>+{selected.xpReward} XP</Text>
                  <View style={[styles.detailStatusTag, selected.earned ? styles.detailStatusEarned : styles.detailStatusLocked]}>
                    <Ionicons
                      name={selected.earned ? 'checkmark-circle' : 'lock-closed'}
                      size={13}
                      color={selected.earned ? colors.success : colors.textSecondary}
                    />
                    <Text style={[styles.detailStatusText, { color: selected.earned ? colors.success : colors.textSecondary }]}>
                      {selected.earned ? 'Earned' : 'Not yet earned'}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  medalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
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

  // Detail modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  detailSheet: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  closeBtn: { position: 'absolute', top: 14, right: 14, zIndex: 1 },
  detailIconContainer: {
    width: 84,
    height: 84,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    marginTop: 8,
  },
  detailName: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  detailDescription: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 14, marginBottom: 16 },
  detailFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailXp: { fontSize: 15, fontWeight: '800', color: colors.xpBar },
  detailStatusTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  detailStatusEarned: { backgroundColor: colors.success + '22' },
  detailStatusLocked: { backgroundColor: colors.secondary },
  detailStatusText: { fontSize: 12, fontWeight: '700' },
});
