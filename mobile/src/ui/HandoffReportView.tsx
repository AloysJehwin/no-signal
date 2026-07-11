import React from 'react';
import {Image, ScrollView, StyleSheet, Text, View} from 'react-native';
import {HandoffReport} from '../sync/HandoffReport';
import {AttemptedStep} from '../state/AttemptedStep';
import {characters, colors, radius, spacing, typography} from './theme';

interface Props {
  report: HandoffReport;
}

export const HandoffReportView: React.FC<Props> = ({report}) => {
  const attempts = report.fullHistory.length;
  const caption = report.safetyFlag
    ? 'Safety hazard detected. Stop work until reviewed.'
    : `${attempts} attempt${attempts === 1 ? '' : 's'} couldn't resolve. Full conversation queued for the cloud training pipeline.`;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}>
      <View style={styles.heroWrap}>
        <Image
          source={characters.handoff}
          style={styles.hero}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>

      {report.safetyFlag ? (
        <View style={styles.safetyBanner}>
          <Text style={styles.safetyLabel}>SAFETY HAZARD</Text>
          <Text style={styles.safetyBody}>
            Stop work immediately. Await supervisor review before proceeding.
          </Text>
        </View>
      ) : null}

      <View style={styles.header}>
        <Text style={styles.title}>
          {report.safetyFlag ? 'Handoff to training' : 'Logged for cloud learning'}
        </Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>

      <View style={styles.card}>
        <MetaRow label="EQUIPMENT" value={report.equipmentType} />
        <Divider />
        <MetaRow label="SYMPTOM" value={report.symptomRaw} multiline />
        <Divider />
        <MetaRow
          label="LEADING HYPOTHESIS"
          value={report.leadingHypothesis ?? 'None'}
          multiline
        />
        <Divider />
        <ConfidenceRow value={report.confidence} />
      </View>

      <Text style={styles.section}>RULED OUT</Text>
      <View style={styles.ruledOutCard}>
        {report.ruledOut.length === 0 ? (
          <Text style={styles.ruledOutEmpty}>Nothing ruled out yet.</Text>
        ) : (
          report.ruledOut.map((item, i) => (
            <View key={`${i}-${item.slice(0, 12)}`} style={styles.ruledOutRow}>
              <Text style={styles.ruledOutMark}>×</Text>
              <Text style={styles.ruledOutText}>{item}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.section}>WHAT WE TRIED</Text>
      <View style={styles.timeline}>
        {report.fullHistory.map((s, i) => (
          <TimelineStep
            key={`${s.timestamp}-${i}`}
            index={i + 1}
            step={s}
            isLast={i === report.fullHistory.length - 1}
          />
        ))}
      </View>

      <View style={styles.aboutCard}>
        <Text style={styles.aboutLabel}>ABOUT THIS SESSION</Text>
        <Text style={styles.aboutBody}>
          All {report.fullHistory.length} attempted steps and the ruled-out
          hypotheses were queued for the cloud training pipeline. Gemini will
          extract the diagnostic pattern, mint new fault-tree entries, and push
          them back to every device on the next sync.
        </Text>
        <Text style={styles.aboutHint}>
          Anonymized. Uses your queued conversation only. Nothing is uploaded
          until you're back online.
        </Text>
      </View>
    </ScrollView>
  );
};

const MetaRow: React.FC<{label: string; value: string; multiline?: boolean}> = ({
  label,
  value,
  multiline,
}) => (
  <View style={[styles.row, multiline && styles.rowMultiline]}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.value, multiline && styles.valueMultiline]}>{value}</Text>
  </View>
);

const ConfidenceRow: React.FC<{value: number}> = ({value}) => {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.confidenceRow}>
      <View style={styles.confidenceHeader}>
        <Text style={styles.label}>CONFIDENCE</Text>
        <Text style={styles.value}>{(pct * 100).toFixed(0)}%</Text>
      </View>
      <View style={styles.confidenceTrack}>
        <View style={[styles.confidenceFill, {width: `${pct * 100}%`}]} />
      </View>
    </View>
  );
};

const TimelineStep: React.FC<{
  index: number;
  step: AttemptedStep;
  isLast: boolean;
}> = ({index, step, isLast}) => (
  <View style={styles.timelineRow}>
    <View style={styles.timelineLeft}>
      <View style={styles.timelineCircle}>
        <Text style={styles.timelineCircleText}>{index}</Text>
      </View>
      {!isLast ? <View style={styles.timelineLine} /> : null}
    </View>
    <View style={styles.timelineBody}>
      <Text style={styles.stepTitle}>{step.step}</Text>
      <View style={styles.stepMetaBlock}>
        <Text style={styles.stepMetaLabel}>Expected</Text>
        <Text style={styles.stepMetaValue}>{step.expected}</Text>
      </View>
      <View style={styles.stepMetaBlock}>
        <Text style={styles.stepMetaLabel}>Reported</Text>
        <Text style={styles.stepMetaValue}>{step.reported}</Text>
      </View>
      <View
        style={[
          styles.matchChip,
          step.match ? styles.matchChipOk : styles.matchChipBad,
        ]}>
        <Text
          style={[
            styles.matchChipText,
            step.match ? styles.matchChipTextOk : styles.matchChipTextBad,
          ]}>
          {step.match ? 'MATCH' : 'MISMATCH'}
        </Text>
      </View>
    </View>
  </View>
);

const Divider: React.FC = () => <View style={styles.divider} />;

// Semi-transparent tinted backgrounds derived from theme colors.
// These use the theme's danger/success hex values with alpha in the RGBA form.
const dangerTint = 'rgba(178, 34, 34, 0.10)';
const successTint = 'rgba(47, 122, 72, 0.14)';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  heroWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  hero: {
    width: 160,
    height: 160,
  },
  safetyBanner: {
    backgroundColor: dangerTint,
    padding: spacing.xl,
    borderRadius: radius.md,
    marginBottom: spacing.xl,
  },
  safetyLabel: {
    ...typography.micro,
    color: colors.danger,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  safetyBody: {
    ...typography.bodyStrong,
    color: colors.danger,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  caption: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  rowMultiline: {
    alignItems: 'flex-start',
  },
  label: {
    ...typography.micro,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    width: 140,
  },
  value: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
  },
  valueMultiline: {
    ...typography.body,
    fontWeight: '600',
    lineHeight: 22,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  confidenceRow: {
    paddingVertical: spacing.md,
  },
  confidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  confidenceTrack: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: colors.ink,
  },
  section: {
    ...typography.micro,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  ruledOutCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginBottom: spacing.xl,
  },
  ruledOutRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  ruledOutMark: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    width: 24,
    lineHeight: 22,
  },
  ruledOutText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
    textDecorationLine: 'line-through',
    textDecorationStyle: 'solid',
    textDecorationColor: colors.textTertiary,
  },
  ruledOutEmpty: {
    ...typography.body,
    color: colors.textTertiary,
    paddingVertical: spacing.md,
  },
  timeline: {
    marginBottom: spacing.xl,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineLeft: {
    width: 40,
    alignItems: 'center',
  },
  timelineCircle: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineCircleText: {
    ...typography.caption,
    color: colors.ctaText,
    fontWeight: '700',
  },
  timelineLine: {
    flex: 1,
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.ink,
    marginTop: spacing.xs,
    minHeight: spacing.xl,
  },
  timelineBody: {
    flex: 1,
    paddingLeft: spacing.lg,
    paddingBottom: spacing.xl,
  },
  stepTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  stepMetaBlock: {
    marginBottom: spacing.sm,
  },
  stepMetaLabel: {
    ...typography.micro,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  stepMetaValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  matchChip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  matchChipOk: {
    backgroundColor: successTint,
  },
  matchChipBad: {
    backgroundColor: dangerTint,
  },
  matchChipText: {
    ...typography.micro,
    textTransform: 'uppercase',
  },
  matchChipTextOk: {
    color: colors.success,
  },
  matchChipTextBad: {
    color: colors.danger,
  },
  aboutCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.xl,
  },
  aboutLabel: {
    ...typography.micro,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  aboutBody: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  aboutHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
