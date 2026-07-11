import React, {useEffect, useState} from 'react';
import NetInfo, {NetInfoState} from '@react-native-community/netinfo';
import {StyleSheet, Text, View} from 'react-native';

export const OfflineBadge: React.FC = () => {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s: NetInfoState) => {
      setOnline(Boolean(s.isConnected && s.isInternetReachable !== false));
    });
    return () => unsub();
  }, []);

  return (
    <View style={[styles.badge, online ? styles.online : styles.offline]}>
      <Text style={styles.text}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12},
  online: {backgroundColor: '#1b7f3a'},
  offline: {backgroundColor: '#8a1c1c'},
  text: {color: '#fff', fontSize: 11, fontWeight: '600'},
});
