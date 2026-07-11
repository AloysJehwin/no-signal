import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import {ModelDownloader, DownloadProgress} from '../decide/ModelDownloader';
import {ExpoGemmaLlm, isNativeLlmAvailable} from '../../modules/expo-gemma-llm/src';
import {characters, colors, radius, spacing, touchTargets, typography} from './theme';

interface Props {
  onReady: () => void;
}

type Phase = 'checking' | 'idle' | 'downloading' | 'initializing' | 'error' | 'ready';

const TOTAL_GB = 3.7;

const useOndeviceLlm = (): boolean => {
  const extra = Constants.expoConfig?.extra as {useOndeviceLlm?: boolean} | undefined;
  return extra?.useOndeviceLlm ?? (process.env.EXPO_PUBLIC_USE_ONDEVICE_LLM === 'true');
};

const formatGB = (fraction: number) => `${(fraction * TOTAL_GB).toFixed(2)} GB`;

const formatEta = (seconds: number) => {
  if (!isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `about ${Math.ceil(seconds)}s remaining`;
  const m = Math.ceil(seconds / 60);
  if (m < 60) return `about ${m} min remaining`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `about ${h}h ${rem}m remaining`;
};

export const ModelSetupScreen: React.FC<Props> = ({onReady}) => {
  const [phase, setPhase] = useState<Phase>('checking');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const startedAt = useRef<number | null>(null);
  const [eta, setEta] = useState('');

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    if (startedAt.current && progress > 0.01) {
      const elapsed = (Date.now() - startedAt.current) / 1000;
      const remaining = (elapsed / progress) * (1 - progress);
      setEta(formatEta(remaining));
    }
  }, [progress, progressAnim]);

  const bootstrap = useCallback(async () => {
    try {
      if (!useOndeviceLlm()) {
        onReady();
        setPhase('ready');
        return;
      }
      if (!isNativeLlmAvailable) {
        onReady();
        setPhase('ready');
        return;
      }
      if (ExpoGemmaLlm.isReady()) {
        onReady();
        setPhase('ready');
        return;
      }
      const hasFile = await ModelDownloader.exists();
      if (hasFile) {
        setPhase('initializing');
        await ExpoGemmaLlm.initializeModel(ModelDownloader.path);
        onReady();
        setPhase('ready');
        return;
      }
      setPhase('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [onReady]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const startDownload = useCallback(async () => {
    setError(null);
    setPhase('downloading');
    setProgress(0);
    setEta('');
    startedAt.current = Date.now();
    try {
      await ModelDownloader.download((p: DownloadProgress) => setProgress(p.fraction));
      setPhase('initializing');
      await ExpoGemmaLlm.initializeModel(ModelDownloader.path);
      onReady();
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [onReady]);

  const progressWidth = useMemo(
    () => progressAnim.interpolate({inputRange: [0, 1], outputRange: ['0%', '100%']}),
    [progressAnim],
  );

  if (phase === 'ready') return null;

  const pct = Math.round(progress * 100);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <View style={styles.heroWrap}>
        <Image
          source={characters.thinking}
          style={styles.hero}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>

      <Text style={styles.headline}>On-device{'\n'}intelligence.</Text>
      <Text style={styles.subhead}>
        Field diagnosis, anywhere. No signal required.
      </Text>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>MODEL</Text>
          <Text style={styles.infoValue}>Gemma-3n E2B</Text>
        </View>
        <View style={styles.infoDivider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>SIZE</Text>
          <Text style={styles.infoValue}>~3.7 GB</Text>
        </View>
        <View style={styles.infoDivider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>ENABLES</Text>
          <Text style={styles.infoValue}>Offline · Multimodal</Text>
        </View>
      </View>

      {(phase === 'checking' || phase === 'initializing') && (
        <View style={styles.statusBlock}>
          <Image
            source={characters.thinking}
            style={styles.heroSmall}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <ActivityIndicator size="small" color={colors.ink} style={styles.spinner} />
          <Text style={styles.statusText}>
            {phase === 'checking' ? 'Checking for local model' : 'Loading model into memory'}
          </Text>
        </View>
      )}

      {phase === 'downloading' && (
        <View style={styles.statusBlock}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, {width: progressWidth}]} />
          </View>
          <View style={styles.progressMeta}>
            <Text style={styles.progressBytes}>
              {formatGB(progress)} of {TOTAL_GB.toFixed(1)} GB
            </Text>
            <Text style={styles.progressPct}>{pct}%</Text>
          </View>
          {eta ? <Text style={styles.etaText}>{eta}</Text> : null}
        </View>
      )}

      {phase === 'error' && (
        <View style={styles.errorCard}>
          <Text style={styles.errorLabel}>DOWNLOAD FAILED</Text>
          <Text style={styles.errorBody}>{error || 'Something went wrong.'}</Text>
          <TouchableOpacity
            style={styles.pillCta}
            onPress={startDownload}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Retry download">
            <Text style={styles.pillCtaText}>Retry download</Text>
            <Text style={styles.pillCtaArrow}>→</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'idle' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.pillCta}
            onPress={startDownload}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Download model">
            <Text style={styles.pillCtaText}>Download model</Text>
            <Text style={styles.pillCtaArrow}>→</Text>
          </TouchableOpacity>
          <Text style={styles.helperText}>
            One-time download. Wi-Fi strongly recommended.
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  heroWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  hero: {
    width: 240,
    height: 240,
  },
  heroSmall: {
    width: 96,
    height: 96,
  },
  headline: {
    ...typography.display,
    color: colors.textPrimary,
    textAlign: 'left',
    marginBottom: spacing.md,
  },
  subhead: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'left',
    marginBottom: spacing.xxl,
  },
  infoCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginBottom: spacing.xxl,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    minHeight: touchTargets.min,
  },
  infoLabel: {
    ...typography.micro,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  infoValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  statusBlock: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  spinner: {
    marginTop: spacing.lg,
  },
  statusText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.cta,
    borderRadius: radius.pill,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.lg,
    width: '100%',
  },
  progressBytes: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  progressPct: {
    ...typography.title,
    color: colors.textPrimary,
  },
  etaText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  errorCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    marginBottom: spacing.lg,
  },
  errorLabel: {
    ...typography.micro,
    color: colors.danger,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  errorBody: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },
  actions: {
    alignItems: 'stretch',
  },
  pillCta: {
    backgroundColor: colors.cta,
    minHeight: touchTargets.hero,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.xxl,
    alignSelf: 'stretch',
  },
  pillCtaText: {
    ...typography.heading,
    color: colors.ctaText,
  },
  pillCtaArrow: {
    ...typography.heading,
    color: colors.ctaText,
    marginLeft: spacing.md,
  },
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
