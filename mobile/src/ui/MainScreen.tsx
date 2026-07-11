import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {OfflineBadge} from './OfflineBadge';
import {HandoffReportView} from './HandoffReportView';
import {ReasoningLoop, DecideResult} from '../decide/ReasoningLoop';
import {SessionStore} from '../state/SessionStore';
import {SessionState} from '../state/SessionState';
import {HandoffReport} from '../sync/HandoffReport';
import {startListening} from '../sense/VoiceInput';

export const MainScreen: React.FC = () => {
  const [loop] = useState(() => new ReasoningLoop());
  const [symptom, setSymptom] = useState('');
  const [session, setSession] = useState<SessionState | null>(null);
  const [current, setCurrent] = useState<DecideResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState<HandoffReport | null>(null);

  useEffect(() => SessionStore.instance.subscribe(setSession), []);

  const beginSession = useCallback(async () => {
    if (!symptom.trim()) return;
    setBusy(true);
    setHandoff(null);
    try {
      loop.sense({equipmentType: 'diesel_genset', symptomRaw: symptom, capturedAt: new Date().toISOString()});
      const step = await loop.decide();
      loop.act(step);
      setCurrent(step);
    } finally {
      setBusy(false);
    }
  }, [loop, symptom]);

  const report = useCallback(
    async (worked: boolean) => {
      if (!current || !session) return;
      setBusy(true);
      try {
        const step = loop.check(current, worked ? current.expected : 'did not work');
        const after = SessionStore.instance.current;
        if (after?.status === 'resolved') {
          setCurrent(null);
          return;
        }
        if (after?.status === 'deferred') {
          setHandoff(loop.defer(false));
          setCurrent(null);
          return;
        }
        void step;
        const next = await loop.decide();
        loop.act(next);
        setCurrent(next);
      } finally {
        setBusy(false);
      }
    },
    [loop, current, session],
  );

  const voice = useCallback(async () => {
    try {
      const text = await startListening();
      setSymptom(text);
    } catch {
      // permission denied or no result — user can fall back to typing
    }
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>FieldFix</Text>
        <OfflineBadge />
      </View>

      {!session || session.status !== 'in_progress' ? (
        <View>
          <TextInput
            style={styles.input}
            placeholder="Describe the fault..."
            value={symptom}
            onChangeText={setSymptom}
            multiline
          />
          <View style={styles.row}>
            <TouchableOpacity style={styles.btn} onPress={voice}>
              <Text style={styles.btnText}>Voice</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.primary]} onPress={beginSession}>
              <Text style={styles.btnText}>Diagnose</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {busy ? <ActivityIndicator style={styles.spinner} /> : null}

      {current && session?.status === 'in_progress' ? (
        <View style={styles.stepCard}>
          <Text style={styles.stepLabel}>Try this</Text>
          <Text style={styles.stepText}>{current.step}</Text>
          <Text style={styles.expected}>Expected: {current.expected}</Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.success]} onPress={() => report(true)}>
              <Text style={styles.btnText}>Worked</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.danger]} onPress={() => report(false)}>
              <Text style={styles.btnText}>Didn't work</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {handoff ? <HandoffReportView report={handoff} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, padding: 16},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12},
  title: {fontSize: 22, fontWeight: '700'},
  input: {borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, minHeight: 80, textAlignVertical: 'top'},
  row: {flexDirection: 'row', gap: 8, marginTop: 12},
  btn: {flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#555', alignItems: 'center'},
  primary: {backgroundColor: '#007AFF'},
  success: {backgroundColor: '#1b7f3a'},
  danger: {backgroundColor: '#8a1c1c'},
  btnText: {color: '#fff', fontWeight: '600'},
  spinner: {marginVertical: 12},
  stepCard: {marginTop: 16, padding: 12, borderRadius: 8, backgroundColor: '#f2f2f7'},
  stepLabel: {fontSize: 12, color: '#666', textTransform: 'uppercase'},
  stepText: {fontSize: 18, fontWeight: '600', marginTop: 4},
  expected: {marginTop: 4, color: '#333'},
});
