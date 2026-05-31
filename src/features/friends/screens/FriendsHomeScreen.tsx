import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import type { FriendsStackScreenProps } from '../../../app/navigation/types';

const MOCK_FRIENDS = [
  { id: 'u1', handle: 'alex', displayName: 'Alex K.' },
  { id: 'u2', handle: 'maya', displayName: 'Maya T.' },
];

export default function FriendsHomeScreen({ navigation }: FriendsStackScreenProps<'FriendsHome'>) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>friends</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddFriend')}>
          <Text style={styles.addButtonText}>+ add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={MOCK_FRIENDS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.displayName[0]}</Text>
            </View>
            <View>
              <Text style={styles.name}>{item.displayName}</Text>
              <Text style={styles.handle}>@{item.handle}</Text>
            </View>
          </View>
        )}
      />

      <TouchableOpacity
        style={styles.inviteButton}
        onPress={() => navigation.navigate('InviteManagement')}>
        <Text style={styles.inviteButtonText}>manage invite codes</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACE.LG,
  },
  title: { fontSize: FONT.SIZES.XXL, fontWeight: '700', color: C.INK },
  addButton: {
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.FULL,
    paddingHorizontal: SPACE.MD,
    paddingVertical: SPACE.XS,
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  addButtonText: { color: C.INK, fontSize: FONT.SIZES.SM },
  list: { paddingHorizontal: SPACE.LG, gap: SPACE.SM },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.MD,
    backgroundColor: C.SURFACE,
    padding: SPACE.MD,
    borderRadius: RADIUS.MD,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.FULL,
    backgroundColor: C.ACCENT_LITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: FONT.SIZES.LG, fontWeight: '700', color: C.ACCENT },
  name: { fontSize: FONT.SIZES.MD, fontWeight: '600', color: C.INK },
  handle: { fontSize: FONT.SIZES.SM, color: C.MUTED },
  inviteButton: {
    margin: SPACE.LG,
    padding: SPACE.MD,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
    alignItems: 'center',
  },
  inviteButtonText: { color: C.MUTED, fontSize: FONT.SIZES.SM },
});
