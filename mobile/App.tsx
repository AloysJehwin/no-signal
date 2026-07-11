import React, {useCallback, useEffect, useState} from 'react';
import {Platform, SafeAreaView, StatusBar as RNStatusBar, StyleSheet, View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {MainScreen} from './src/ui/MainScreen';
import {ModelSetupScreen} from './src/ui/ModelSetupScreen';
import {LocalRagStore} from './src/rag/LocalRagStore';
import {SyncQueue} from './src/sync/SyncQueue';

const App: React.FC = () => {
  const [servicesReady, setServicesReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await LocalRagStore.instance.init();
        SyncQueue.instance.watchConnectivity();
      } catch {
        // init failure is non-fatal — UI still renders in degraded mode
      } finally {
        setServicesReady(true);
      }
    })();
  }, []);

  const onModelReady = useCallback(() => setModelReady(true), []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        {servicesReady && modelReady ? (
          <MainScreen />
        ) : servicesReady ? (
          <ModelSetupScreen onReady={onModelReady} />
        ) : null}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0,
  },
  content: {flex: 1},
});

export default App;
