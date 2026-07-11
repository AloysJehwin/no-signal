import React, {useEffect, useState} from 'react';
import NetInfo, {NetInfoState} from '@react-native-community/netinfo';
import {StyleSheet, Text, View} from 'react-native';
import {colors, radius, spacing, typography} from './theme';

export const OfflineBadge: React.FC = () => {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s: NetInfoState) => {
      setOnline(Boolean(s.isConnected && s.isInternetReachable !== false));
    });
    return () => unsub();
  }, []);

  const dotColor = online ? colors.online : colors.offline;

  return (
    <View style={styles.badge}>
      <View style={[styles.dot, {backgroundColor: dotColor}]} />
      <Text style={styles.text}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    marginRight: spacing.xs,
  },
  text: {
    ...typography.micro,
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
});
