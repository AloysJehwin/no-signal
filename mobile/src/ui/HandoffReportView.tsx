import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {HandoffReport} from '../sync/HandoffReport';

interface Props {
  report: HandoffReport;
}

export const HandoffReportView: React.FC<Props> = ({report}) => (
  <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.title}>Deferred to human expert</Text>
    {report.safetyFlag ? (
      <Text style={styles.safety}>SAFETY FLAG — do not continue unaided.</Text>
    ) : null}
    <Row label="Equipment" value={report.equipmentType} />
    <Row label="Symptom" value={report.symptomRaw} />
    <Row label="Leading hypothesis" value={report.leadingHypothesis ?? 'none'} />
    <Row label="Confidence" value={report.confidence.toFixed(2)} />
    <Row label="Ruled out" value={report.ruledOut.join(', ') || 'none'} />
    <Text style={styles.section}>What we tried</Text>
    {report.fullHistory.map((s, i) => (
      <View key={i} style={styles.step}>
        <Text style={styles.stepTitle}>
          {i + 1}. {s.step}
        </Text>
        <Text style={styles.stepBody}>expected: {s.expected}</Text>
        <Text style={styles.stepBody}>reported: {s.reported}</Text>
        <Text style={styles.stepBody}>result: {s.match ? 'match' : 'mismatch'}</Text>
      </View>
    ))}
  </ScrollView>
);

const Row: React.FC<{label: string; value: string}> = ({label, value}) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {padding: 16},
  title: {fontSize: 20, fontWeight: '700', marginBottom: 8},
  safety: {color: '#8a1c1c', fontWeight: '700', marginBottom: 12},
  row: {flexDirection: 'row', marginVertical: 2},
  label: {width: 140, color: '#555'},
  value: {flex: 1, fontWeight: '500'},
  section: {marginTop: 16, marginBottom: 6, fontSize: 16, fontWeight: '600'},
  step: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ccc', paddingVertical: 8},
  stepTitle: {fontWeight: '600'},
  stepBody: {color: '#333'},
});
