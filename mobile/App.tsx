import React, {useEffect, useState} from 'react';
import {SafeAreaView, StatusBar, StyleSheet, View} from 'react-native';
import {MainScreen} from './src/ui/MainScreen';
import {LocalRagStore} from './src/rag/LocalRagStore';
import {SyncQueue} from './src/sync/SyncQueue';

const App: React.FC = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await LocalRagStore.instance.init();
      SyncQueue.instance.watchConnectivity();
      setReady(true);
    })();
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>{ready ? <MainScreen /> : null}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#fff'},
  content: {flex: 1},
});

export default App;
