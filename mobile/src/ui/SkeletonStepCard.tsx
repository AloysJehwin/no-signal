import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import {colors, radius, spacing, typography} from './theme';

interface Props {
  showVisual?: boolean;
}

// Animated shimmer placeholder that mirrors the shape of the real step card.
// Replaces the circular ActivityIndicator during a DECIDE call.
export const SkeletonStepCard: React.FC<Props> = ({showVisual = false}) => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: false,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const bg = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surfaceMuted, colors.divider],
  });

  const Bar: React.FC<{width: number | string; height?: number; style?: object}> = ({
    width,
    height = 14,
    style,
  }) => (
    <Animated.View
      style={[
        styles.bar,
        {width: width as number, height, backgroundColor: bg},
        style,
      ]}
    />
  );

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Animated.View style={[styles.circle, {backgroundColor: bg}]} />
        <Animated.View style={[styles.pill, {backgroundColor: bg}]} />
      </View>

      <Animated.View style={[styles.confLine, {backgroundColor: bg}]} />

      <View style={styles.block}>
        <Bar width={110} height={10} style={styles.label} />
        <Bar width={'80%'} height={20} />
      </View>

      <View style={styles.block}>
        <Bar width={70} height={10} style={styles.label} />
        <Bar width={'92%'} height={22} />
      </View>

      <View style={styles.substeps}>
        {[0, 1, 2].map(i => (
          <View key={i} style={styles.substepItem}>
            <View style={styles.substepRow}>
              <Animated.View style={[styles.numCircle, {backgroundColor: bg}]} />
              <Bar width={i === 2 ? '55%' : '70%'} height={14} />
            </View>
            <Animated.View style={[styles.substepImage, {backgroundColor: bg}]} />
          </View>
        ))}
      </View>

      <View style={styles.expectedBlock}>
        <Bar width={100} height={10} style={styles.label} />
        <Bar width={'85%'} height={14} />
      </View>

      {showVisual ? (
        <View style={styles.visualBlock}>
          <Bar width={110} height={10} style={styles.label} />
          <Bar width={'75%'} height={12} style={{marginTop: spacing.xs}} />
          <Bar width={'65%'} height={12} style={{marginTop: spacing.xs}} />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circle: {width: 40, height: 40, borderRadius: radius.pill},
  pill: {width: 110, height: 28, borderRadius: radius.pill},
  confLine: {height: 4, borderRadius: radius.pill, width: '30%'},
  block: {gap: spacing.xs, marginTop: spacing.sm},
  label: {borderRadius: radius.sm / 2},
  bar: {borderRadius: radius.sm / 2},
  substeps: {gap: spacing.md, marginTop: spacing.sm},
  substepItem: {gap: spacing.sm},
  substepRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  numCircle: {width: 28, height: 28, borderRadius: radius.pill},
  substepImage: {
    height: 140,
    marginLeft: spacing.xxl + spacing.md,
    borderRadius: radius.md,
    maxWidth: '85%',
  },
  expectedBlock: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.xs,
  },
  visualBlock: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.xs,
  },
});

// Silence unused-vars lint check in theme import when typography isn't used.
void typography;
